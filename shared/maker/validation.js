import { calculateCreditSummary } from "./credits.js";

import {
  checkCreditRequirements,
  checkRequiredCourses,
} from "./requirements.js";

import { checkPrerequisites } from "./prerequisites.js";
import { checkTermCreditLimit } from "./term-limit.js";

// 전체 이수요건 검증
export function validatePlan(plan, curriculum) {
  // 1. 기본 데이터 확인
  if (
    !plan ||
    !curriculum ||
    plan.schemaVersion !== 1 ||
    curriculum.schemaVersion !== 1
  ) {
    throw new TypeError("데이터 계약 버전이 올바르지 않습니다.");
  }

  if (plan.curriculumId !== curriculum.curriculumId) {
    throw new Error("수강 계획과 교육과정 ID가 일치하지 않습니다.");
  }

  // 사용자 확인 필요 항목 수 검사
  const reviewPendingCount = plan.reviewPendingCount;

  if (
    !Number.isInteger(reviewPendingCount) ||
    reviewPendingCount < 0
  ) {
    throw new TypeError("확인 필요 항목 수가 올바르지 않습니다.");
  }

  // 2. 학점 요약 계산
  const summary = calculateCreditSummary(plan, curriculum);

  // 3. 각각의 이수요건 검사
  const creditChecks = checkCreditRequirements(plan, curriculum);

  const requiredCourses = checkRequiredCourses(plan, curriculum);

  const prerequisites = checkPrerequisites(plan, curriculum);

  const termCreditLimit = checkTermCreditLimit(plan, curriculum);

  // 4. 사용자 확인 필요 항목 검사
  const inputReview = {
    status: reviewPendingCount === 0 ? "met" : "unknown",
    reviewPendingCount,
  };

  // 5. 모든 검증 결과 합치기
  const checks = {
    totalCredits: creditChecks.totalCredits,
    majorCredits: creditChecks.majorCredits,
    majorElectiveCredits: creditChecks.majorElectiveCredits,
    requiredCourses,
    prerequisites,
    termCreditLimit,
    inputReview,
  };

  // 6. 최종 상태 결정
  const statuses = Object.values(checks).map(
    check => check.status
  );

  let overallStatus = "met";

  if (statuses.includes("unmet")) {
    overallStatus = "unmet";
  } else if (statuses.includes("unknown")) {
    overallStatus = "unknown";
  }

  // 7. 사용자에게 보여줄 경고 메시지
  const warnings = [];

  if (checks.totalCredits.status === "unknown") {
    warnings.push(
      "총 졸업 학점 기준이 확인되지 않아 전체 이수요건을 확정할 수 없습니다."
    );
  }

  if (checks.majorCredits.status === "unknown") {
    warnings.push("전공 최소 학점 기준을 확인할 수 없습니다.");
  }

  if (checks.majorElectiveCredits.status === "unknown") {
    warnings.push("전공선택 최소 학점 기준을 확인할 수 없습니다.");
  }

  if (checks.requiredCourses.status === "unknown") {
    warnings.push("필수 이수 과목 목록을 확인할 수 없습니다.");
  }

  if (checks.prerequisites.status === "unknown") {
    warnings.push("일부 과목의 공식 선수 조건을 확인할 수 없습니다.");
  }

  if (checks.termCreditLimit.status === "unknown") {
    warnings.push("학기 최대 신청 학점 기준을 확인할 수 없습니다.");
  }

  if (reviewPendingCount > 0) {
    warnings.push(
      `사용자 확인이 필요한 항목이 ${reviewPendingCount}개 남아 있습니다.`
    );
  }

  // 8. 계약서에 정의된 최종 응답 구조 반환
  return {
    schemaVersion: 1,
    overallStatus,
    summary,
    checks,
    warnings,
  };
}
