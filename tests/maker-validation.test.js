import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyPlan } from "../shared/maker/plan.js";
import { validatePlan } from "../shared/maker/validation.js";

// 테스트용 교육과정 데이터
const curriculum = {
  schemaVersion: 1,
  curriculumId: "ce-demo-2026",
  courses: [
    {
      id: "demo-prog",
      credits: 3,
      category: "major_required",
      hardPrerequisiteIds: [],
    },
    {
      id: "demo-ds",
      credits: 3,
      category: "major_required",
      hardPrerequisiteIds: ["demo-prog"],
    },
    {
      id: "demo-ml",
      credits: 3,
      category: "major_elective",
      hardPrerequisiteIds: ["demo-ds"],
    },
  ],
  requirements: {
    minimumTotalCredits: null,
    minimumMajorCredits: 9,
    minimumMajorElectiveCredits: 3,
    requiredCourseIds: ["demo-prog", "demo-ds"],
    maximumTermCredits: 6,
  },
};

// 공통 수강 계획 생성 함수
function createSamplePlan() {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    {
      courseId: "demo-prog",
      termId: "2025-1",
      earnedCredits: 3,
    },
    {
      courseId: "demo-ds",
      termId: "2026-1",
      earnedCredits: 3,
    },
  ];

  plan.otherEarnedCredits.general_elective = 3;

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-ml"],
    },
  ];

  return plan;
}

// 1. 계약서 예시의 최종 검증 결과
test("계약서 예시 전체 검증", () => {
  const result = validatePlan(createSamplePlan(), curriculum);

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.overallStatus, "unknown");

  assert.deepEqual(result.summary, {
    earnedTotalCredits: 9,
    inProgressCredits: 0,
    plannedCredits: 3,
    projectedTotalCredits: 12,
    earnedMajorCredits: 6,
    projectedMajorCredits: 9,
    projectedMajorElectiveCredits: 3,
  });

  assert.equal(result.checks.totalCredits.status, "unknown");
  assert.equal(result.checks.majorCredits.status, "met");
  assert.equal(result.checks.majorElectiveCredits.status, "met");
  assert.equal(result.checks.requiredCourses.status, "met");
  assert.equal(result.checks.prerequisites.status, "met");
  assert.equal(result.checks.termCreditLimit.status, "met");
  assert.equal(result.checks.inputReview.status, "met");
});

// 2. 모든 조건을 충족하는 경우
test("모든 이수요건 충족 시 met", () => {
  const completeCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      minimumTotalCredits: 12,
    },
  };

  const result = validatePlan(
    createSamplePlan(),
    completeCurriculum
  );

  assert.equal(result.overallStatus, "met");
  assert.deepEqual(result.warnings, []);
});

// 3. unmet과 unknown이 동시에 존재하는 경우
test("미충족 요건이 있으면 unmet 우선", () => {
  const invalidCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      minimumMajorCredits: 12,
    },
  };

  const result = validatePlan(
    createSamplePlan(),
    invalidCurriculum
  );

  assert.equal(result.checks.totalCredits.status, "unknown");
  assert.equal(result.checks.majorCredits.status, "unmet");
  assert.equal(result.overallStatus, "unmet");
});

// 4. 사용자 확인 필요 항목이 남은 경우
test("확인 필요 항목이 있으면 unknown", () => {
  const plan = createSamplePlan();
  plan.reviewPendingCount = 2;

  const completeCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      minimumTotalCredits: 12,
    },
  };

  const result = validatePlan(plan, completeCurriculum);

  assert.equal(result.overallStatus, "unknown");
  assert.equal(result.checks.inputReview.status, "unknown");
  assert.equal(result.checks.inputReview.reviewPendingCount, 2);
  assert.ok(result.warnings.length > 0);
});

// 5. 필수 과목이 누락된 경우
test("필수 과목 누락 시 unmet", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const result = validatePlan(plan, curriculum);

  assert.equal(result.checks.requiredCourses.status, "unmet");

  assert.deepEqual(
    result.checks.requiredCourses.missingCourseIds,
    ["demo-prog", "demo-ds"]
  );

  assert.equal(result.overallStatus, "unmet");
});

// 6. 선수과목을 같은 학기에 배치한 경우
test("선수과목 순서 위반 시 unmet", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds"],
    },
  ];

  const result = validatePlan(plan, curriculum);

  assert.equal(result.checks.prerequisites.status, "unmet");

  assert.ok(
    result.checks.prerequisites.issues.some(
      issue => issue.type === "same_term"
    )
  );

  assert.equal(result.overallStatus, "unmet");
});

// 7. 한 학기 최대 신청 학점 초과
test("학기 학점 상한 초과 시 unmet", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog"],
    },
  ];

  const limitedCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      maximumTermCredits: 2,
    },
  };

  const result = validatePlan(plan, limitedCurriculum);

  assert.equal(result.checks.termCreditLimit.status, "unmet");
  assert.equal(result.checks.termCreditLimit.issues[0].excessCredits, 1);
  assert.equal(result.overallStatus, "unmet");
});

// 8. 계약 버전 및 교육과정 ID 오류 검사
test("잘못된 계약 버전과 교육과정 ID 검사", () => {
  const invalidVersionPlan = createSamplePlan();
  invalidVersionPlan.schemaVersion = 2;

  assert.throws(() => {
    validatePlan(invalidVersionPlan, curriculum);
  });

  const invalidIdPlan = createSamplePlan();
  invalidIdPlan.curriculumId = "wrong-curriculum";

  assert.throws(() => {
    validatePlan(invalidIdPlan, curriculum);
  });
});
