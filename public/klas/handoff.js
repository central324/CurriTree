const HANDOFF_KEY = 'curritree:maker-handoff:v1';

const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;

const CURRICULUM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const OTHER_CATEGORIES = [
  'general_required',
  'general_elective',
  'foundation_required',
  'foundation_elective',
  'free_elective',
];

function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function isValidCredits(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function isValidCourseId(value) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  );
}

function isValidTermId(value) {
  return (
    typeof value === 'string' &&
    TERM_PATTERN.test(value)
  );
}

function copyCompletedCourse(course) {
  if (
    !isObject(course) ||
    !isValidCourseId(course.courseId) ||
    !isValidTermId(course.termId) ||
    !isValidCredits(course.earnedCredits)
  ) {
    throw new TypeError('이수 완료 과목 정보가 올바르지 않습니다.');
  }

  return {
    courseId: course.courseId,
    termId: course.termId,
    earnedCredits: course.earnedCredits,
  };
}

function copyInProgressCourse(course) {
  if (
    !isObject(course) ||
    !isValidCourseId(course.courseId) ||
    !isValidTermId(course.termId)
  ) {
    throw new TypeError('수강 중 과목 정보가 올바르지 않습니다.');
  }

  return {
    courseId: course.courseId,
    termId: course.termId,
  };
}

function copyPlannedTerm(term) {
  if (
    !isObject(term) ||
    !isValidTermId(term.termId) ||
    !Array.isArray(term.courseIds) ||
    !term.courseIds.every(isValidCourseId)
  ) {
    throw new TypeError('수강 예정 학기 정보가 올바르지 않습니다.');
  }

  return {
    termId: term.termId,
    courseIds: [...term.courseIds],
  };
}

/**
 * KLAS 분석 결과를 커리메이커 전달용 데이터로 정리합니다.
 *
 * 계약에 정의된 필드만 복사합니다.
 * KLAS 원본 텍스트와 원문 성적은 포함하지 않습니다.
 */
export function sanitizeMakerPlan(plan) {
  if (
    !isObject(plan) ||
    plan.schemaVersion !== 1 ||
    typeof plan.curriculumId !== 'string' ||
    !CURRICULUM_ID_PATTERN.test(plan.curriculumId) ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms) ||
    !isObject(plan.otherEarnedCredits) ||
    !Number.isInteger(plan.reviewPendingCount) ||
    plan.reviewPendingCount < 0
  ) {
    throw new TypeError('커리메이커 전달 데이터가 올바르지 않습니다.');
  }

  const otherEarnedCredits = {};

  for (const category of OTHER_CATEGORIES) {
    const credits = plan.otherEarnedCredits[category];

    if (!isValidCredits(credits)) {
      throw new TypeError('전공 외 취득 학점 정보가 올바르지 않습니다.');
    }

    otherEarnedCredits[category] = credits;
  }

  return {
    schemaVersion: 1,
    curriculumId: plan.curriculumId,

    completedCourses: plan.completedCourses.map(
      copyCompletedCourse
    ),

    inProgressCourses: plan.inProgressCourses.map(
      copyInProgressCourse
    ),

    otherEarnedCredits,

    plannedTerms: plan.plannedTerms.map(
      copyPlannedTerm
    ),

    reviewPendingCount: plan.reviewPendingCount,
  };
}

/**
 * 정리된 수강 계획을 임시 저장합니다.
 */
export function saveMakerHandoff(storage, plan) {
  const safePlan = sanitizeMakerPlan(plan);

  storage.setItem(
    HANDOFF_KEY,
    JSON.stringify(safePlan)
  );
}

/**
 * 수강 계획을 한 번 읽은 후 저장소에서 제거합니다.
 */
export function consumeMakerHandoff(storage) {
  let rawData;

  try {
    rawData = storage.getItem(HANDOFF_KEY);

    if (rawData === null) {
      return null;
    }

    // 읽은 데이터는 재사용되지 않도록 즉시 제거합니다.
    storage.removeItem(HANDOFF_KEY);

    return sanitizeMakerPlan(
      JSON.parse(rawData)
    );
  } catch {
    return null;
  }
}
