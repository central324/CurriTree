import { analyzeCourseHistory } from './history.js';

const MAJOR_CATEGORIES = new Set([
  'major_required',
  'major_elective',
]);

const OTHER_CATEGORIES = [
  'general_required',
  'general_elective',
  'foundation_required',
  'foundation_elective',
  'free_elective',
];

const OTHER_CATEGORY_SET = new Set(OTHER_CATEGORIES);

const ACTIVE_STATUSES = new Set([
  'completed',
  'in_progress',
]);

const VALID_MATCH_STATUSES = new Set([
  'exact',
  'confirmed',
]);

function hasValidCredits(credits) {
  return (
    typeof credits === 'number' &&
    Number.isFinite(credits) &&
    credits >= 0
  );
}

function hasValidCourseMatch(row, validCourseIds) {
  return (
    VALID_MATCH_STATUSES.has(row.match?.status) &&
    typeof row.match.courseId === 'string' &&
    validCourseIds.has(row.match.courseId)
  );
}

function createOtherCredits() {
  return {
    general_required: 0,
    general_elective: 0,
    foundation_required: 0,
    foundation_elective: 0,
    free_elective: 0,
  };
}

/**
 * 확정 가능한 수강 이력만 커리메이커 데이터 계약으로 변환합니다.
 *
 * - KLAS 원본과 성적 원문은 포함하지 않습니다.
 * - 재수강 및 중복 기록은 history.js의 분석 결과를 따릅니다.
 * - AI 추천 상태(suggested)는 확정된 과목으로 취급하지 않습니다.
 * - 불확실한 과목은 reviewPendingCount에 반영합니다.
 */
export function buildMakerPlan(rows, curriculum) {
  if (!Array.isArray(rows)) {
    throw new TypeError('수강 이력은 배열이어야 합니다.');
  }

  if (
    !curriculum ||
    typeof curriculum.curriculumId !== 'string' ||
    !Array.isArray(curriculum.courses)
  ) {
    throw new TypeError('교육과정 데이터가 올바르지 않습니다.');
  }

  const rowMap = new Map();

  for (const row of rows) {
    if (
      !row ||
      typeof row.clientRowId !== 'string' ||
      !row.clientRowId.trim()
    ) {
      throw new TypeError('수강 이력의 행 ID가 올바르지 않습니다.');
    }

    if (rowMap.has(row.clientRowId)) {
      throw new TypeError('중복된 수강 이력 행 ID가 있습니다.');
    }

    rowMap.set(row.clientRowId, row);
  }

  const validCourseIds = new Set(
    curriculum.courses.map((course) => course.id)
  );

  const history = analyzeCourseHistory(rows);

  const reviewPending = new Set(
    history.reviewPendingRowIds
  );

  // 이수 상태와 매칭 정보를 한 번 더 검증합니다.
  for (const row of rows) {
    if (row.completionStatus === 'needs_review') {
      reviewPending.add(row.clientRowId);
      continue;
    }

    if (!ACTIVE_STATUSES.has(row.completionStatus)) {
      continue;
    }

    const isMajor = MAJOR_CATEGORIES.has(row.category);
    const isOther = OTHER_CATEGORY_SET.has(row.category);

    // 이수구분이 불명확하면 자동으로 학점을 인정하지 않습니다.
    if (!isMajor && !isOther) {
      reviewPending.add(row.clientRowId);
      continue;
    }

    // 취득 학점을 계산할 수 없는 완료 기록은 확인 대상으로 남깁니다.
    if (
      row.completionStatus === 'completed' &&
      !hasValidCredits(row.credits)
    ) {
      reviewPending.add(row.clientRowId);
      continue;
    }

    // 전공 과목은 유효한 교육과정 과목 ID가 필요합니다.
    if (isMajor && !hasValidCourseMatch(row, validCourseIds)) {
      reviewPending.add(row.clientRowId);
    }
  }

  const completedCourses = [];
  const inProgressCourses = [];
  const otherEarnedCredits = createOtherCredits();

  const completedCourseIds = new Set();
  const inProgressCourseIds = new Set();

  // 재수강 분석을 통과한 이수 완료 기록만 반영합니다.
  for (const clientRowId of history.completedCandidates) {
    if (reviewPending.has(clientRowId)) {
      continue;
    }

    const row = rowMap.get(clientRowId);

    if (!row) {
      continue;
    }

    if (MAJOR_CATEGORIES.has(row.category)) {
      const courseId = row.match.courseId;

      if (completedCourseIds.has(courseId)) {
        reviewPending.add(clientRowId);
        continue;
      }

      completedCourseIds.add(courseId);

      completedCourses.push({
        courseId,
        termId: row.termId,
        earnedCredits: row.credits,
      });
    } else if (OTHER_CATEGORY_SET.has(row.category)) {
      otherEarnedCredits[row.category] += row.credits;
    }
  }

  // 수강 중인 전공 과목은 취득 학점과 분리합니다.
  for (const clientRowId of history.inProgressCandidates) {
    if (reviewPending.has(clientRowId)) {
      continue;
    }

    const row = rowMap.get(clientRowId);

    if (!row || !MAJOR_CATEGORIES.has(row.category)) {
      continue;
    }

    const courseId = row.match.courseId;

    if (
      completedCourseIds.has(courseId) ||
      inProgressCourseIds.has(courseId)
    ) {
      reviewPending.add(clientRowId);
      continue;
    }

    inProgressCourseIds.add(courseId);

    inProgressCourses.push({
      courseId,
      termId: row.termId,
    });
  }

  // 중복으로 발견된 과목은 확정 목록에서 제거합니다.
  const finalizedCompleted = completedCourses.filter(
    (course) =>
      !rows.some(
        (row) =>
          reviewPending.has(row.clientRowId) &&
          row.match?.courseId === course.courseId
      )
  );

  const finalizedInProgress = inProgressCourses.filter(
    (course) =>
      !rows.some(
        (row) =>
          reviewPending.has(row.clientRowId) &&
          row.match?.courseId === course.courseId
      )
  );

  const reviewPendingRowIds = rows
    .filter((row) => reviewPending.has(row.clientRowId))
    .map((row) => row.clientRowId);

  const plan = {
    schemaVersion: 1,
    curriculumId: curriculum.curriculumId,
    completedCourses: finalizedCompleted,
    inProgressCourses: finalizedInProgress,
    otherEarnedCredits,
    plannedTerms: [],
    reviewPendingCount: reviewPendingRowIds.length,
  };

  return {
    plan,
    reviewPendingRowIds,
    historyIssues: history.reviewIssues,
  };
}