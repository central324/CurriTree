import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyPlan } from "../shared/maker/plan.js";
import { calculateCreditSummary } from "../shared/maker/credits.js";

// 테스트용 교육과정 데이터
const curriculum = {
  courses: [
    {
      id: "demo-prog",
      credits: 3,
      category: "major_required",
    },
    {
      id: "demo-ds",
      credits: 3,
      category: "major_required",
    },
    {
      id: "demo-ml",
      credits: 3,
      category: "major_elective",
    },
  ],
};

// 1. 이수 완료 학점과 예정 학점 계산
test("취득 학점과 예상 학점 계산", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    { courseId: "demo-prog", termId: "2025-1", earnedCredits: 3 },
    { courseId: "demo-ds", termId: "2026-1", earnedCredits: 3 },
  ];

  plan.otherEarnedCredits.general_elective = 3;

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ml"] },
  ];

  const result = calculateCreditSummary(plan, curriculum);

  assert.deepEqual(result, {
    earnedTotalCredits: 9,
    inProgressCredits: 0,
    plannedCredits: 3,
    projectedTotalCredits: 12,
    earnedMajorCredits: 6,
    projectedMajorCredits: 9,
    projectedMajorElectiveCredits: 3,
  });
});

// 2. 수강 중인 과목은 취득 학점에서 제외
test("수강 중 과목은 예상 학점에만 포함", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.inProgressCourses = [
    { courseId: "demo-ml", termId: "2026-2" },
  ];

  const result = calculateCreditSummary(plan, curriculum);

  assert.equal(result.earnedTotalCredits, 0);
  assert.equal(result.inProgressCredits, 3);
  assert.equal(result.plannedCredits, 0);
  assert.equal(result.projectedTotalCredits, 3);
  assert.equal(result.earnedMajorCredits, 0);
  assert.equal(result.projectedMajorCredits, 3);
  assert.equal(result.projectedMajorElectiveCredits, 3);
});

// 3. 이미 이수한 과목을 계획에 중복 등록한 경우
test("이수 완료 과목과 예정 과목 중복 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    { courseId: "demo-prog", termId: "2025-1", earnedCredits: 3 },
  ];

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-prog"] },
  ];

  assert.throws(() => {
    calculateCreditSummary(plan, curriculum);
  });
});

// 4. 수강 중 과목을 계획에 중복 등록한 경우
test("수강 중 과목과 예정 과목 중복 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.inProgressCourses = [
    { courseId: "demo-ml", termId: "2026-2" },
  ];

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ml"] },
  ];

  assert.throws(() => {
    calculateCreditSummary(plan, curriculum);
  });
});

// 5. 같은 과목을 서로 다른 계획 학기에 배치한 경우
test("서로 다른 학기 사이의 중복 과목 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ml"] },
    { termId: "2027-2", courseIds: ["demo-ml"] },
  ];

  assert.throws(() => {
    calculateCreditSummary(plan, curriculum);
  });
});

// 6. 교육과정에 존재하지 않는 과목 ID 검사
test("존재하지 않는 과목 ID 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["unknown-course"] },
  ];

  assert.throws(() => {
    calculateCreditSummary(plan, curriculum);
  });
});

// 7. 잘못된 학점 입력 검사
test("음수 학점 입력 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.otherEarnedCredits.general_elective = -3;

  assert.throws(() => {
    calculateCreditSummary(plan, curriculum);
  });

  const plan2 = createEmptyPlan("ce-demo-2026");

  plan2.completedCourses = [
    { courseId: "demo-prog", termId: "2025-1", earnedCredits: -1 },
  ];

  assert.throws(() => {
    calculateCreditSummary(plan2, curriculum);
  });
});
