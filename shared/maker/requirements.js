import { calculateCreditSummary } from "./credits.js";
export function checkMinimumCredits(earned, projected, required) {
  // 현재 취득 학점과 예상 학점이 올바른지 확인
  if (
    typeof earned !== "number" ||
    !Number.isFinite(earned) ||
    earned < 0 ||
    typeof projected !== "number" ||
    !Number.isFinite(projected) ||
    projected < earned
  ) {
    throw new TypeError("학점 정보가 올바르지 않습니다.");
  }

  // 공식 최소 학점 기준이 확인되지 않은 경우
  if (required === null) {
    return {
      status: "unknown",
      earned,
      projected,
      required: null,
      missing: null,
    };
  }

  // 최소 학점 기준 유효성 검사
  if (
    typeof required !== "number" ||
    !Number.isFinite(required) ||
    required < 0
  ) {
    throw new TypeError("최소 요구 학점이 올바르지 않습니다.");
  }

  // 부족한 학점 계산
  const missing = Math.max(0, required - projected);

  return {
    status: missing === 0 ? "met" : "unmet",
    earned,
    projected,
    required,
    missing,
  };
}

export function checkCreditRequirements(plan, curriculum) {
  // 교육과정의 이수요건 정보 확인
  if (
    !curriculum ||
    !curriculum.requirements ||
    typeof curriculum.requirements !== "object" ||
    Array.isArray(curriculum.requirements)
  ) {
    throw new TypeError("이수요건 정보가 올바르지 않습니다.");
  }

  // 기존 학점 계산 함수 사용
  const summary = calculateCreditSummary(plan, curriculum);
  const requirements = curriculum.requirements;

  // 과목 ID를 이용해 과목 정보 검색
  const courseMap = new Map(
    curriculum.courses.map(course => [course.id, course])
  );

  // 이미 취득한 전공선택 학점 계산
  let earnedMajorElectiveCredits = 0;

  for (const item of plan.completedCourses) {
    const course = courseMap.get(item.courseId);

    if (course.category === "major_elective") {
      earnedMajorElectiveCredits += item.earnedCredits;
    }
  }

  // 각 학점 요건을 개별적으로 검사
  return {
    totalCredits: checkMinimumCredits(
      summary.earnedTotalCredits,
      summary.projectedTotalCredits,
      requirements.minimumTotalCredits
    ),

    majorCredits: checkMinimumCredits(
      summary.earnedMajorCredits,
      summary.projectedMajorCredits,
      requirements.minimumMajorCredits
    ),

    majorElectiveCredits: checkMinimumCredits(
      earnedMajorElectiveCredits,
      summary.projectedMajorElectiveCredits,
      requirements.minimumMajorElectiveCredits
    ),
  };
}

export function checkRequiredCourses(plan, curriculum) {
  // 수강 계획과 교육과정 데이터 확인
  if (
    !plan ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms) ||
    !curriculum ||
    !Array.isArray(curriculum.courses) ||
    !curriculum.requirements
  ) {
    throw new TypeError("수강 계획 또는 교육과정 형식이 올바르지 않습니다.");
  }

  const requiredIds = curriculum.requirements.requiredCourseIds;

  // 공식 필수 과목 목록이 확인되지 않은 경우
  if (requiredIds === null) {
    return {
      status: "unknown",
      missingCourseIds: null,
    };
  }

  // 필수 과목 목록 형식 검사
  if (!Array.isArray(requiredIds)) {
    throw new TypeError("필수 과목 목록이 올바르지 않습니다.");
  }

  // 교육과정에 실제 존재하는 과목 ID 확인
  const validCourseIds = new Set(
    curriculum.courses.map(course => course.id)
  );

  for (const courseId of requiredIds) {
    if (!validCourseIds.has(courseId)) {
      throw new Error(`존재하지 않는 필수 과목 ID: ${courseId}`);
    }
  }

  // 이수 완료한 과목
  const completedIds = plan.completedCourses.map(
    item => item.courseId
  );

  // 현재 수강 중인 과목
  const inProgressIds = plan.inProgressCourses.map(
    item => item.courseId
  );

  // 향후 수강 예정 과목
  const plannedIds = plan.plannedTerms.flatMap(
    term => term.courseIds
  );

  // 모든 수강 상태의 과목 ID를 하나로 합침
  const availableIds = new Set([
    ...completedIds,
    ...inProgressIds,
    ...plannedIds,
  ]);

  // 필수 과목 중 누락된 과목 찾기
  const missingCourseIds = requiredIds.filter(
    courseId => !availableIds.has(courseId)
  );

  return {
    status: missingCourseIds.length === 0 ? "met" : "unmet",
    missingCourseIds,
  };
}
