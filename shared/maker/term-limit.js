export function checkTermCreditLimit(plan, curriculum) {
  // 1. 입력 데이터 확인
  if (
    !plan ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms) ||
    !curriculum ||
    !Array.isArray(curriculum.courses) ||
    !curriculum.requirements
  ) {
    throw new TypeError("수강 계획 또는 교육과정 형식이 올바르지 않습니다.");
  }

  const maximumCredits = curriculum.requirements.maximumTermCredits;

  // 2. 최대 학점 기준 검사
  if (maximumCredits !== null && (
    typeof maximumCredits !== "number" ||
    !Number.isFinite(maximumCredits) ||
    maximumCredits < 0
  )) {
    throw new TypeError("최대 신청 학점 기준이 올바르지 않습니다.");
  }

  // 과목 ID로 학점 정보를 찾기 위한 Map
  const courseMap = new Map(
    curriculum.courses.map(course => [course.id, course])
  );

  // 학기별 학점 합계를 저장할 Map
  const termCredits = new Map();

  // 중복 과목 계산 방지
  const countedCourseIds = new Set();

  function addCredits(termId, courseId) {
    // 학기 형식 확인
    if (
      typeof termId !== "string" ||
      !/^\d{4}-(1|2|S|W)$/.test(termId)
    ) {
      throw new TypeError("학기 형식이 올바르지 않습니다.");
    }

    const course = courseMap.get(courseId);

    if (!course) {
      throw new Error(`존재하지 않는 과목 ID: ${courseId}`);
    }

    if (countedCourseIds.has(courseId)) {
      throw new Error(`중복 등록된 과목: ${courseId}`);
    }

    if (
      typeof course.credits !== "number" ||
      !Number.isFinite(course.credits) ||
      course.credits < 0
    ) {
      throw new TypeError("과목 학점이 올바르지 않습니다.");
    }

    countedCourseIds.add(courseId);

    const currentCredits = termCredits.get(termId) || 0;

    termCredits.set(
      termId,
      currentCredits + course.credits
    );
  }

  // 3. 현재 수강 중인 과목 학점 계산
  for (const item of plan.inProgressCourses) {
    addCredits(item.termId, item.courseId);
  }

  // 4. 향후 수강 예정 과목 학점 계산
  for (const term of plan.plannedTerms) {
    if (!Array.isArray(term.courseIds)) {
      throw new TypeError("수강 예정 과목 목록이 올바르지 않습니다.");
    }

    for (const courseId of term.courseIds) {
      addCredits(term.termId, courseId);
    }
  }

  // 5. 공식 학점 상한이 확인되지 않은 경우
  if (maximumCredits === null) {
    return {
      status: "unknown",
      issues: [],
    };
  }

  // 6. 학기별 학점 상한 초과 여부 확인
  const issues = [];

  for (const [termId, credits] of termCredits) {
    if (credits > maximumCredits) {
      issues.push({
        termId,
        credits,
        maximumCredits,
        excessCredits: credits - maximumCredits,
        message: "학기별 최대 신청 학점을 초과했습니다.",
      });
    }
  }

  // 7. 최종 검증 결과 반환
  return {
    status: issues.length === 0 ? "met" : "unmet",
    issues,
  };
}
