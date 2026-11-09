import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyPlan } from "../shared/maker/plan.js";
import { checkTermCreditLimit } from "../shared/maker/term-limit.js";

// 테스트용 교육과정 데이터
const curriculum = {
  courses: [
    { id: "demo-prog", credits: 3 },
    { id: "demo-ds", credits: 3 },
    { id: "demo-ml", credits: 3 },
    { id: "demo-web", credits: 2 },
  ],
  requirements: {
    maximumTermCredits: 6,
  },
};

// 1. 수강 예정 과목이 없는 경우
test("빈 수강 계획은 학점 상한 충족", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const result = checkTermCreditLimit(plan, curriculum);

  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 2. 최대 신청 학점을 정확히 충족
test("최대 신청 학점 정확히 충족", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds"],
    },
  ];

  const result = checkTermCreditLimit(plan, curriculum);

  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 3. 학점 상한을 초과한 경우
test("학기 최대 학점 초과 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds", "demo-ml"],
    },
  ];

  const result = checkTermCreditLimit(plan, curriculum);

  assert.equal(result.status, "unmet");
  assert.equal(result.issues.length, 1);

  assert.equal(result.issues[0].termId, "2027-1");
  assert.equal(result.issues[0].credits, 9);
  assert.equal(result.issues[0].maximumCredits, 6);
  assert.equal(result.issues[0].excessCredits, 3);
});

// 4. 수강 중 과목과 예정 과목을 합산
test("수강 중 과목과 예정 과목의 학점 합산", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.inProgressCourses = [
    {
      courseId: "demo-prog",
      termId: "2027-1",
    },
  ];

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-ds"],
    },
  ];

  // 이전 학기에 이수한 과목은 신청 학점에서 제외
  plan.completedCourses = [
    {
      courseId: "demo-ml",
      termId: "2026-1",
      earnedCredits: 3,
    },
  ];

  const result = checkTermCreditLimit(plan, curriculum);

  // 수강 중 3학점 + 예정 3학점 = 6학점
  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 5. 서로 다른 학기는 별도로 계산
test("학기별 신청 학점 독립 계산", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds"],
    },
    {
      termId: "2027-2",
      courseIds: ["demo-ml"],
    },
  ];

  const result = checkTermCreditLimit(plan, curriculum);

  // 1학기 6학점, 2학기 3학점
  assert.equal(result.status, "met");
  assert.deepEqual(result.issues, []);
});

// 6. 공식 최대 학점 기준이 없는 경우
test("학기 최대 학점 기준 미확인", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-prog", "demo-ds", "demo-ml"],
    },
  ];

  const unknownCurriculum = {
    ...curriculum,
    requirements: {
      maximumTermCredits: null,
    },
  };

  const result = checkTermCreditLimit(
    plan,
    unknownCurriculum
  );

  assert.equal(result.status, "unknown");
  assert.deepEqual(result.issues, []);
});

// 7. 동일 과목 중복 등록 방지
test("중복 과목 신청 학점 계산 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.inProgressCourses = [
    {
      courseId: "demo-prog",
      termId: "2027-1",
    },
  ];

  plan.plannedTerms = [
    {
      termId: "2027-2",
      courseIds: ["demo-prog"],
    },
  ];

  assert.throws(() => {
    checkTermCreditLimit(plan, curriculum);
  });
});

// 8. 잘못된 학기 및 과목 ID 검사
test("잘못된 학기 및 과목 ID 오류", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.plannedTerms = [
    {
      termId: "2027-3",
      courseIds: ["demo-prog"],
    },
  ];

  assert.throws(() => {
    checkTermCreditLimit(plan, curriculum);
  });

  const plan2 = createEmptyPlan("ce-demo-2026");

  plan2.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["unknown-course"],
    },
  ];

  assert.throws(() => {
    checkTermCreditLimit(plan2, curriculum);
  });
});
