const TERM_ORDER = {
  "1": 0,
  S: 1,
  "2": 2,
  W: 3,
};

// 실제 학기를 비교하기 위한 함수
function getTermOrder(termId) {
  if (
    typeof termId !== "string" ||
    !/^\d{4}-(1|2|S|W)$/.test(termId)
  ) {
    throw new TypeError("학기 형식이 올바르지 않습니다.");
  }

  const [year, semester] = termId.split("-");

  return Number(year) * 4 + TERM_ORDER[semester];
}

// 선수과목 순서 검사
export function checkPrerequisites(plan, curriculum) {
  if (
    !plan ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms) ||
    !curriculum ||
    !Array.isArray(curriculum.courses)
  ) {
    throw new TypeError("수강 계획 또는 교육과정 형식이 올바르지 않습니다.");
  }

  const courseMap = new Map(
    curriculum.courses.map(course => [course.id, course])
  );

  // 과목별 수강 학기 기록
  const courseTerms = new Map();

  function registerCourse(courseId, termId) {
    if (!courseMap.has(courseId)) {
      throw new Error(`존재하지 않는 과목 ID: ${courseId}`);
    }

    const order = getTermOrder(termId);

    if (courseTerms.has(courseId)) {
      throw new Error(`중복 등록된 과목: ${courseId}`);
    }

    courseTerms.set(courseId, {
      termId,
      order,
    });
  }

  // 1. 이수 완료 과목 등록
  for (const item of plan.completedCourses) {
    registerCourse(item.courseId, item.termId);
  }

  // 2. 수강 중 과목 등록
  for (const item of plan.inProgressCourses) {
    registerCourse(item.courseId, item.termId);
  }

  // 3. 수강 예정 과목 등록
  for (const term of plan.plannedTerms) {
    if (!Array.isArray(term.courseIds)) {
      throw new TypeError("수강 예정 과목 목록이 올바르지 않습니다.");
    }

    for (const courseId of term.courseIds) {
      registerCourse(courseId, term.termId);
    }
  }

  const issues = [];
  let hasViolation = false;
  let hasUnknown = false;

  // 4. 등록된 각 과목의 선수 조건 검사
  for (const [courseId, currentTerm] of courseTerms) {
    const course = courseMap.get(courseId);
    const prerequisites = course.hardPrerequisiteIds;

    // 공식 선수 조건 미확인
    if (prerequisites === null) {
      hasUnknown = true;

      issues.push({
        type: "unknown",
        courseId,
        prerequisiteCourseId: null,
        message: "공식 선수 조건을 확인할 수 없습니다.",
      });

      continue;
    }

    if (!Array.isArray(prerequisites)) {
      throw new TypeError("선수과목 정보가 올바르지 않습니다.");
    }

    for (const prerequisiteId of prerequisites) {
      if (!courseMap.has(prerequisiteId)) {
        throw new Error(`존재하지 않는 선수과목 ID: ${prerequisiteId}`);
      }

      const previousTerm = courseTerms.get(prerequisiteId);

      // 선수과목 누락
      if (!previousTerm) {
        hasViolation = true;

        issues.push({
          type: "missing",
          courseId,
          prerequisiteCourseId: prerequisiteId,
          message: "필수 선수과목이 수강 계획에 없습니다.",
        });

        continue;
      }

      // 같은 학기에 배치
      if (previousTerm.order === currentTerm.order) {
        hasViolation = true;

        issues.push({
          type: "same_term",
          courseId,
          prerequisiteCourseId: prerequisiteId,
          message: "선수과목과 대상 과목이 같은 학기입니다.",
        });
      }

      // 선수과목이 더 늦은 학기에 배치
      if (previousTerm.order > currentTerm.order) {
        hasViolation = true;

        issues.push({
          type: "wrong_order",
          courseId,
          prerequisiteCourseId: prerequisiteId,
          message: "선수과목이 대상 과목보다 늦게 배치되었습니다.",
        });
      }
    }
  }

  // 5. 전체 선수 조건 판정
  let status = "met";

  if (hasViolation) {
    status = "unmet";
  } else if (hasUnknown) {
    status = "unknown";
  }

  return {
    status,
    issues,
  };
}
