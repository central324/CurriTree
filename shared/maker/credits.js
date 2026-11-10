const MAJOR_CATEGORIES = [
  "major_required",
  "major_elective",
];

const OTHER_CATEGORIES = [
  "general_required",
  "general_elective",
  "foundation_required",
  "foundation_elective",
  "free_elective",
];

export function calculateCreditSummary(plan, curriculum) {
  // 수강 계획과 교육과정 데이터 확인
  if (
    !plan ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms) ||
    !plan.otherEarnedCredits ||
    !curriculum ||
    !Array.isArray(curriculum.courses)
  ) {
    throw new TypeError("수강 계획 또는 교육과정 형식이 올바르지 않습니다.");
  }

  // 과목 ID로 과목 정보를 찾을 수 있도록 Map 생성
  const courseMap = new Map(
    curriculum.courses.map(course => [course.id, course])
  );

  // 같은 과목을 두 번 계산하지 않기 위한 Set
  const countedCourses = new Set();

  function getCourse(courseId) {
    const course = courseMap.get(courseId);

    if (!course) {
      throw new Error(`존재하지 않는 과목 ID: ${courseId}`);
    }

    if (countedCourses.has(courseId)) {
      throw new Error(`중복 등록된 과목: ${courseId}`);
    }

    if (
      typeof course.credits !== "number" ||
      !Number.isFinite(course.credits) ||
      course.credits < 0
    ) {
      throw new Error(`과목 학점이 올바르지 않습니다: ${courseId}`);
    }

    countedCourses.add(courseId);
    return course;
  }

  // 학점 계산 결과
  const summary = {
    earnedTotalCredits: 0,
    inProgressCredits: 0,
    plannedCredits: 0,
    projectedTotalCredits: 0,
    earnedMajorCredits: 0,
    projectedMajorCredits: 0,
    projectedMajorElectiveCredits: 0,
  };

  let earnedMajorElectiveCredits = 0;
  let futureMajorCredits = 0;
  let futureMajorElectiveCredits = 0;

  // 1. 이수 완료한 과목 계산
  for (const item of plan.completedCourses) {
    const course = getCourse(item.courseId);
    const credits = item.earnedCredits;

    if (
      typeof credits !== "number" ||
      !Number.isFinite(credits) ||
      credits < 0
    ) {
      throw new Error("인정 학점이 올바르지 않습니다.");
    }

    summary.earnedTotalCredits += credits;

    if (MAJOR_CATEGORIES.includes(course.category)) {
      summary.earnedMajorCredits += credits;
    }

    if (course.category === "major_elective") {
      earnedMajorElectiveCredits += credits;
    }
  }

  // 2. 전공 외 취득 학점 계산
  for (const category of OTHER_CATEGORIES) {
    const credits = plan.otherEarnedCredits[category];

    if (
      typeof credits !== "number" ||
      !Number.isFinite(credits) ||
      credits < 0
    ) {
      throw new Error(`전공 외 학점이 올바르지 않습니다: ${category}`);
    }

    summary.earnedTotalCredits += credits;
  }

  // 3. 수강 중인 과목 계산
  for (const item of plan.inProgressCourses) {
    const course = getCourse(item.courseId);

    summary.inProgressCredits += course.credits;

    if (MAJOR_CATEGORIES.includes(course.category)) {
      futureMajorCredits += course.credits;
    }

    if (course.category === "major_elective") {
      futureMajorElectiveCredits += course.credits;
    }
  }

  // 4. 향후 수강 예정 과목 계산
  for (const term of plan.plannedTerms) {
    if (!Array.isArray(term.courseIds)) {
      throw new TypeError("수강 예정 과목 목록이 올바르지 않습니다.");
    }

    for (const courseId of term.courseIds) {
      const course = getCourse(courseId);

      summary.plannedCredits += course.credits;

      if (MAJOR_CATEGORIES.includes(course.category)) {
        futureMajorCredits += course.credits;
      }

      if (course.category === "major_elective") {
        futureMajorElectiveCredits += course.credits;
      }
    }
  }

  // 5. 예상 학점 계산
  summary.projectedTotalCredits =
    summary.earnedTotalCredits +
    summary.inProgressCredits +
    summary.plannedCredits;

  summary.projectedMajorCredits =
    summary.earnedMajorCredits + futureMajorCredits;

  summary.projectedMajorElectiveCredits =
    earnedMajorElectiveCredits + futureMajorElectiveCredits;

  return summary;
}
