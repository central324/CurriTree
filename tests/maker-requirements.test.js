import test from "node:test";
import assert from "node:assert/strict";

import {
  checkMinimumCredits,
  checkCreditRequirements,
  checkRequiredCourses,
} from "../shared/maker/requirements.js";

import {
  createEmptyPlan,
} from "../shared/maker/plan.js";

// 1. 최소 요구 학점을 정확하게 충족한 경우
test("최소 학점을 정확히 충족", () => {
  const result = checkMinimumCredits(50, 60, 60);

  assert.deepEqual(result, {
    status: "met",
    earned: 50,
    projected: 60,
    required: 60,
    missing: 0,
  });
});

// 2. 최소 요구 학점보다 1학점 부족한 경우
test("최소 학점보다 1학점 부족", () => {
  const result = checkMinimumCredits(50, 59, 60);

  assert.deepEqual(result, {
    status: "unmet",
    earned: 50,
    projected: 59,
    required: 60,
    missing: 1,
  });
});

// 3. 공식 최소 학점 기준이 확인되지 않은 경우
test("최소 학점 기준이 없으면 unknown", () => {
  const result = checkMinimumCredits(50, 57, null);

  assert.deepEqual(result, {
    status: "unknown",
    earned: 50,
    projected: 57,
    required: null,
    missing: null,
  });
});

// 4. 공식 요구 학점이 0인 경우
test("요구 학점이 0이면 정상 충족", () => {
  const result = checkMinimumCredits(0, 0, 0);

  assert.equal(result.status, "met");
  assert.equal(result.missing, 0);
});

// 5. 잘못된 학점 입력 방지
test("잘못된 학점 데이터 검사", () => {
  // 음수 취득 학점
  assert.throws(() => {
    checkMinimumCredits(-1, 60, 60);
  });

  // 예상 학점이 취득 학점보다 작은 경우
  assert.throws(() => {
    checkMinimumCredits(60, 50, 60);
  });

  // 음수 요구 학점
  assert.throws(() => {
    checkMinimumCredits(50, 60, -10);
  });

  // 숫자가 아닌 학점
  assert.throws(() => {
    checkMinimumCredits("50", 60, 60);
  });
});

const demoCurriculum = {
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
  requirements: {
    minimumTotalCredits: null,
    minimumMajorCredits: 9,
    minimumMajorElectiveCredits: 3,
  },
};

// 테스트에서 공통으로 사용할 수강 계획
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

// 1. 계약서의 정상 예시 확인
test("전체 학점 요건 정상 검증", () => {
  const plan = createSamplePlan();

  const result = checkCreditRequirements(
    plan,
    demoCurriculum
  );

  assert.equal(result.totalCredits.status, "unknown");
  assert.equal(result.majorCredits.status, "met");
  assert.equal(result.majorElectiveCredits.status, "met");

  assert.equal(result.majorCredits.projected, 9);
  assert.equal(result.majorElectiveCredits.projected, 3);
});

// 2. 총학점 기준을 정확히 충족
test("총학점 최소 기준 정확히 충족", () => {
  const plan = createSamplePlan();

  const curriculum = {
    ...demoCurriculum,
    requirements: {
      ...demoCurriculum.requirements,
      minimumTotalCredits: 12,
    },
  };

  const result = checkCreditRequirements(plan, curriculum);

  assert.equal(result.totalCredits.status, "met");
  assert.equal(result.totalCredits.earned, 9);
  assert.equal(result.totalCredits.projected, 12);
  assert.equal(result.totalCredits.missing, 0);
});

// 3. 전공 최소 학점 부족
test("전공 최소 학점 부족 검사", () => {
  const plan = createSamplePlan();

  const curriculum = {
    ...demoCurriculum,
    requirements: {
      ...demoCurriculum.requirements,
      minimumMajorCredits: 12,
    },
  };

  const result = checkCreditRequirements(plan, curriculum);

  assert.equal(result.majorCredits.status, "unmet");
  assert.equal(result.majorCredits.projected, 9);
  assert.equal(result.majorCredits.missing, 3);
});

// 4. 전공선택 학점 부족
test("전공선택 학점 부족 검사", () => {
  const plan = createSamplePlan();

  // 머신러닝 계획 삭제
  plan.plannedTerms = [];

  const curriculum = {
    ...demoCurriculum,
    requirements: {
      ...demoCurriculum.requirements,
      minimumMajorCredits: 6,
    },
  };

  const result = checkCreditRequirements(plan, curriculum);

  assert.equal(result.majorCredits.status, "met");
  assert.equal(result.majorElectiveCredits.status, "unmet");
  assert.equal(result.majorElectiveCredits.projected, 0);
  assert.equal(result.majorElectiveCredits.missing, 3);
});

// 5. 수강 중인 과목의 예상 학점 반영
test("수강 중 과목의 예상 전공 학점 계산", () => {
  const plan = createSamplePlan();

  // 머신러닝을 수강 예정에서 수강 중으로 변경
  plan.plannedTerms = [];

  plan.inProgressCourses = [
    {
      courseId: "demo-ml",
      termId: "2026-2",
    },
  ];

  const result = checkCreditRequirements(
    plan,
    demoCurriculum
  );

  // 실제 취득 전공선택 학점은 아직 0
  assert.equal(result.majorElectiveCredits.earned, 0);

  // 수강 중 학점은 예상 학점에 반영
  assert.equal(result.majorElectiveCredits.projected, 3);

  assert.equal(result.majorElectiveCredits.status, "met");
  assert.equal(result.majorCredits.status, "met");
});

const requiredCurriculum = {
  courses: [
    { id: "demo-prog" },
    { id: "demo-ds" },
    { id: "demo-ml" },
  ],
  requirements: {
    requiredCourseIds: ["demo-prog", "demo-ds"],
  },
};

// 1. 필수 과목을 모두 이수 완료하거나 계획한 경우
test("필수 과목을 모두 포함하면 met", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    {
      courseId: "demo-prog",
      termId: "2025-1",
      earnedCredits: 3,
    },
  ];

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: ["demo-ds"],
    },
  ];

  const result = checkRequiredCourses(
    plan,
    requiredCurriculum
  );

  assert.equal(result.status, "met");
  assert.deepEqual(result.missingCourseIds, []);
});

// 2. 필수 과목이 누락된 경우
test("필수 과목이 누락되면 unmet", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    {
      courseId: "demo-prog",
      termId: "2025-1",
      earnedCredits: 3,
    },
  ];

  const result = checkRequiredCourses(
    plan,
    requiredCurriculum
  );

  assert.equal(result.status, "unmet");
  assert.deepEqual(result.missingCourseIds, ["demo-ds"]);
});

// 3. 현재 수강 중인 필수 과목 처리
test("수강 중인 필수 과목도 계획상 충족 처리", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  plan.completedCourses = [
    {
      courseId: "demo-prog",
      termId: "2025-1",
      earnedCredits: 3,
    },
  ];

  plan.inProgressCourses = [
    {
      courseId: "demo-ds",
      termId: "2026-2",
    },
  ];

  const result = checkRequiredCourses(
    plan,
    requiredCurriculum
  );

  assert.equal(result.status, "met");
  assert.deepEqual(result.missingCourseIds, []);
});

// 4. 필수 과목 목록이 null이거나 빈 배열인 경우
test("필수 과목 목록 null과 빈 배열 구분", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const unknownCurriculum = {
    ...requiredCurriculum,
    requirements: {
      requiredCourseIds: null,
    },
  };

  const unknownResult = checkRequiredCourses(
    plan,
    unknownCurriculum
  );

  assert.equal(unknownResult.status, "unknown");
  assert.equal(unknownResult.missingCourseIds, null);

  const emptyCurriculum = {
    ...requiredCurriculum,
    requirements: {
      requiredCourseIds: [],
    },
  };

  const emptyResult = checkRequiredCourses(
    plan,
    emptyCurriculum
  );

  assert.equal(emptyResult.status, "met");
  assert.deepEqual(emptyResult.missingCourseIds, []);
});

// 5. 존재하지 않는 필수 과목 ID 검사
test("존재하지 않는 필수 과목 ID 오류", () => {
  const plan = createEmptyPlan("ce-demo-2026");

  const invalidCurriculum = {
    ...requiredCurriculum,
    requirements: {
      requiredCourseIds: ["unknown-course"],
    },
  };

  assert.throws(() => {
    checkRequiredCourses(plan, invalidCurriculum);
  });
});
