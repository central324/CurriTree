import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyPlan,
  addCourseToTerm,
  removeCourseFromTerm,
  moveCourseToTerm,
} from "../shared/maker/plan.js";

// 1. 빈 수강 계획이 계약서 형식에 맞게 생성되는지 확인
test("빈 수강 계획 생성", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.curriculumId, "ce-demo-2026");

  assert.deepEqual(plan.completedCourses, []);
  assert.deepEqual(plan.inProgressCourses, []);
  assert.deepEqual(plan.plannedTerms, []);

  assert.deepEqual(plan.otherEarnedCredits, {
    general_required: 0,
    general_elective: 0,
    foundation_required: 0,
    foundation_elective: 0,
    free_elective: 0,
  });

  assert.equal(plan.reviewPendingCount, 0);
});

// 2. 잘못된 교육과정 ID 입력 시 오류가 발생하는지 확인
test("잘못된 교육과정 ID 검사", () => {
  assert.throws(() => createEmptyPlan(""));
  assert.throws(() => createEmptyPlan("   "));
  assert.throws(() => createEmptyPlan(null));
  assert.throws(() => createEmptyPlan(123));
});

// 3. 서로 다른 계획이 독립적으로 생성되는지 확인
test("수강 계획 객체 독립성 검사", () => {
  const plan1 = createEmptyPlan("ce-demo-2026");
  const plan2 = createEmptyPlan("ce-demo-2026");

  plan1.completedCourses.push({
    courseId: "demo-prog",
    termId: "2025-1",
    earnedCredits: 3,
  });

  assert.equal(plan1.completedCourses.length, 1);
  assert.equal(plan2.completedCourses.length, 0);
});

test("새 학기에 과목 추가", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const result = addCourseToTerm(plan, "2027-1", "demo-ml");

  assert.deepEqual(result.plannedTerms, [
    {
      termId: "2027-1",
      courseIds: ["demo-ml"],
    },
  ]);
});

test("기존 학기에 다른 과목 추가", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const first = addCourseToTerm(plan, "2027-1", "demo-ml");
  const second = addCourseToTerm(first, "2027-1", "demo-ds");

  assert.deepEqual(second.plannedTerms[0].courseIds, [
    "demo-ml",
    "demo-ds",
  ]);

  // 원본 데이터는 변경되지 않아야 함
  assert.deepEqual(plan.plannedTerms, []);
  assert.deepEqual(first.plannedTerms[0].courseIds, ["demo-ml"]);
});

test("중복 과목 추가 방지", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const updated = addCourseToTerm(plan, "2027-1", "demo-ml");

  // 다른 학기에 동일 과목 추가
  assert.throws(() => {
    addCourseToTerm(updated, "2027-2", "demo-ml");
  });

  // 이미 이수한 과목 추가
  const completedPlan = {
    ...plan,
    completedCourses: [
      {
        courseId: "demo-prog",
        termId: "2025-1",
        earnedCredits: 3,
      },
    ],
  };

  assert.throws(() => {
    addCourseToTerm(completedPlan, "2027-1", "demo-prog");
  });

  // 현재 수강 중인 과목 추가
  const inProgressPlan = {
    ...plan,
    inProgressCourses: [
      {
        courseId: "demo-ds",
        termId: "2026-2",
      },
    ],
  };

  assert.throws(() => {
    addCourseToTerm(inProgressPlan, "2027-1", "demo-ds");
  });
});

test("잘못된 학기 및 과목 ID 검사", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  assert.throws(() => {
    addCourseToTerm(plan, "2027-3", "demo-ml");
  });

  assert.throws(() => {
    addCourseToTerm(plan, "2027", "demo-ml");
  });

  assert.throws(() => {
    addCourseToTerm(plan, "2027-1", "");
  });
});

test("수강 예정 과목 정상 삭제", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");
  plan = addCourseToTerm(plan, "2027-1", "demo-ds");

  const result = removeCourseFromTerm(
    plan,
    "2027-1",
    "demo-ds"
  );

  assert.deepEqual(result.plannedTerms, [
    {
      termId: "2027-1",
      courseIds: ["demo-ml"],
    },
  ]);
});

test("마지막 과목 삭제 시 빈 학기 제거", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");

  const result = removeCourseFromTerm(
    plan,
    "2027-1",
    "demo-ml"
  );

  assert.deepEqual(result.plannedTerms, []);
});

test("존재하지 않는 과목 삭제 방지", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");

  // 등록되지 않은 과목 삭제 시도
  assert.throws(() => {
    removeCourseFromTerm(plan, "2027-1", "demo-ds");
  });

  // 존재하지 않는 학기에서 삭제 시도
  assert.throws(() => {
    removeCourseFromTerm(plan, "2028-1", "demo-ml");
  });

  // 잘못된 학기 형식
  assert.throws(() => {
    removeCourseFromTerm(plan, "2027-3", "demo-ml");
  });
});

test("과목 삭제 시 원본과 다른 학기 유지", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");
  plan = addCourseToTerm(plan, "2027-2", "demo-ds");

  const result = removeCourseFromTerm(
    plan,
    "2027-1",
    "demo-ml"
  );

  // 원본 계획은 변경되지 않아야 함
  assert.equal(plan.plannedTerms.length, 2);

  // 다른 학기의 과목은 그대로 유지
  assert.deepEqual(result.plannedTerms, [
    {
      termId: "2027-2",
      courseIds: ["demo-ds"],
    },
  ]);
});

test("과목을 다른 학기로 정상 이동", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");

  const result = moveCourseToTerm(
    plan,
    "2027-1",
    "2027-2",
    "demo-ml"
  );

  assert.deepEqual(result.plannedTerms, [
    {
      termId: "2027-2",
      courseIds: ["demo-ml"],
    },
  ]);
});

test("기존 과목이 있는 학기로 이동", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");
  plan = addCourseToTerm(plan, "2027-2", "demo-ds");

  const result = moveCourseToTerm(
    plan,
    "2027-1",
    "2027-2",
    "demo-ml"
  );

  assert.deepEqual(result.plannedTerms, [
    {
      termId: "2027-2",
      courseIds: ["demo-ds", "demo-ml"],
    },
  ]);
});

test("같은 학기로 이동하는 경우 오류", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");

  assert.throws(() => {
    moveCourseToTerm(
      plan,
      "2027-1",
      "2027-1",
      "demo-ml"
    );
  });
});

test("과목 이동 실패 시 원본 유지", () => {
  let plan = createEmptyPlan("ce-demo-2026");

  plan = addCourseToTerm(plan, "2027-1", "demo-ml");

  // 잘못된 학기로 이동하려고 하면 오류 발생
  assert.throws(() => {
    moveCourseToTerm(
      plan,
      "2027-1",
      "2027-3",
      "demo-ml"
    );
  });

  // 이동 실패 후에도 기존 수강 계획은 그대로 유지
  assert.deepEqual(plan.plannedTerms, [
    {
      termId: "2027-1",
      courseIds: ["demo-ml"],
    },
  ]);
});
