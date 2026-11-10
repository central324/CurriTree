import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyPlan } from "../shared/maker/plan.js";
import { checkPrerequisites } from "../shared/maker/prerequisites.js";

// 테스트용 교육과정 데이터
const curriculum = {
  courses: [
    {
      id: "demo-prog",
      hardPrerequisiteIds: [],
      recommendedPreviousIds: [],
    },
    {
      id: "demo-ds",
      hardPrerequisiteIds: ["demo-prog"],
      recommendedPreviousIds: [],
    },
    {
      id: "demo-ml",
      hardPrerequisiteIds: ["demo-ds"],
      recommendedPreviousIds: [],
    },
    {
      id: "demo-unknown",
      hardPrerequisiteIds: null,
      recommendedPreviousIds: [],
    },
    {
      id: "demo-soft",
      hardPrerequisiteIds: [],
      recommendedPreviousIds: ["demo-prog"],
    },
  ],
};

// 1. 선수과목을 올바른 순서로 수강
test("선수과목 순서 정상", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    { courseId: "demo-prog", termId: "2025-1", earnedCredits: 3 },
    { courseId: "demo-ds", termId: "2026-1", earnedCredits: 3 },
  ];

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ml"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 2. 선수과목이 누락된 경우
test("필수 선수과목 누락 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ds"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "unmet");
  assert.equal(result.issues[0].type, "missing");
  assert.equal(result.issues[0].prerequisiteCourseId, "demo-prog");
});

// 3. 선수과목과 대상 과목이 같은 학기
test("선수과목 같은 학기 배치 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds"],
    },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "unmet");
  assert.equal(result.issues[0].type, "same_term");
});

// 4. 선수과목이 더 늦은 학기에 배치됨
test("선수과목 학기 순서 위반 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-ds"] },
    { termId: "2027-2", courseIds: ["demo-prog"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "unmet");
  assert.equal(result.issues[0].type, "wrong_order");
});

// 5. 공식 선수 조건이 확인되지 않은 경우
test("공식 선수 조건 미확인 처리", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-unknown"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "unknown");
  assert.equal(result.issues[0].type, "unknown");
});

// 6. 미충족과 확인 필요가 동시에 발생
test("unmet이 unknown보다 우선", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-ds", "demo-unknown"],
    },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "unmet");

  assert.ok(
    result.issues.some(issue => issue.type === "missing")
  );

  assert.ok(
    result.issues.some(issue => issue.type === "unknown")
  );
});

// 7. 계절학기 순서 확인
test("계절학기 선수과목 순서 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-S", courseIds: ["demo-prog"] },
    { termId: "2027-2", courseIds: ["demo-ds"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 8. 권장 선행 과목은 필수 조건으로 처리하지 않음
test("권장 선행 과목과 필수 선수과목 구분", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    { termId: "2027-1", courseIds: ["demo-soft"] },
  ];

  const result = checkPrerequisites(plan, curriculum);

  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});
