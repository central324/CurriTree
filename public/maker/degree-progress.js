function isValidCredit(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0
  );
}

// 기존 학점 검증 결과를 진행 현황 데이터로 변환합니다.
export function buildCreditProgress(check) {
  if (
    !check ||
    !isValidCredit(check.earned) ||
    !isValidCredit(check.projected) ||
    check.projected < check.earned
  ) {
    throw new TypeError('학점 검증 결과가 올바르지 않습니다.');
  }

  const { earned, projected, required } = check;

  // 공식 학점 기준이 아직 확인되지 않은 경우
  if (required === null) {
    return {
      state: 'unknown',
      earned,
      projected,
      required: null,
      currentMissing: null,
      projectedMissing: null,
      currentPercent: null,
      projectedPercent: null,
    };
  }

  if (
    !isValidCredit(required) ||
    !isValidCredit(check.missing)
  ) {
    throw new TypeError('요구 학점 정보가 올바르지 않습니다.');
  }

  // 요구 학점 0은 별도 이수 요구가 없다는 뜻입니다.
  // 0으로 나누지 않도록 진행률은 표시하지 않습니다.
  if (required === 0) {
    return {
      state: 'no-requirement',
      earned,
      projected,
      required,
      currentMissing: 0,
      projectedMissing: 0,
      currentPercent: null,
      projectedPercent: null,
    };
  }

  const percentage = (credits) =>
    Math.min(
      100,
      Math.round((credits / required) * 1000) / 10
    );

  return {
    state: 'known',
    earned,
    projected,
    required,
    currentMissing: Math.max(0, required - earned),
    projectedMissing: check.missing,
    currentPercent: percentage(earned),
    projectedPercent: percentage(projected),
  };
}

// 전공필수 과목의 실제 수강 상태를 구분합니다.
export function buildRequiredCourseProgress(
  plan,
  curriculum
) {
  if (
    !plan ||
    !curriculum ||
    !curriculum.requirements ||
    !Array.isArray(curriculum.courses) ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms)
  ) {
    throw new TypeError('수강 계획 또는 교육과정이 올바르지 않습니다.');
  }

  const requiredIds = curriculum.requirements.requiredCourseIds;

  if (requiredIds === null) {
    return {
      state: 'unknown',
      total: null,
      counts: null,
      courses: [],
    };
  }

  if (!Array.isArray(requiredIds)) {
    throw new TypeError('전공필수 과목 목록이 올바르지 않습니다.');
  }

  const courseNames = new Map(
    curriculum.courses.map((course) => [
      course.id,
      course.name,
    ])
  );

  const completedIds = new Set(
    plan.completedCourses.map((item) => item.courseId)
  );

  const inProgressIds = new Set(
    plan.inProgressCourses.map((item) => item.courseId)
  );

  const plannedIds = new Set(
    plan.plannedTerms.flatMap((term) => term.courseIds)
  );

  const counts = {
    completed: 0,
    inProgress: 0,
    planned: 0,
    unplaced: 0,
  };

  const courses = requiredIds.map((courseId) => {
    let status = 'unplaced';

    if (completedIds.has(courseId)) {
      status = 'completed';
    } else if (inProgressIds.has(courseId)) {
      status = 'inProgress';
    } else if (plannedIds.has(courseId)) {
      status = 'planned';
    }

    counts[status] += 1;

    return {
      courseId,
      name: courseNames.get(courseId) ?? courseId,
      status,
    };
  });

  return {
    state: 'known',
    total: requiredIds.length,
    counts,
    courses,
  };
}

// 화면은 이 함수의 결과만 사용합니다.
export function buildDegreeProgress(
  validation,
  plan,
  curriculum
) {
  if (!validation || !plan || !curriculum) {
    return null;
  }

  if (
    !validation.checks?.totalCredits ||
    !validation.checks?.majorCredits
  ) {
    throw new TypeError('이수요건 검증 결과가 올바르지 않습니다.');
  }

  return {
    totalCredits: buildCreditProgress(
      validation.checks.totalCredits
    ),
    majorCredits: buildCreditProgress(
      validation.checks.majorCredits
    ),
    requiredCourses: buildRequiredCourseProgress(
      plan,
      curriculum
    ),
  };
}
