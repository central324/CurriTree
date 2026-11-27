import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCreditProgress,
  buildRequiredCourseProgress,
  buildDegreeProgress,
} from '../public/maker/degree-progress.js';

import {
  loadRealCurriculum,
} from './helpers/curriculum.js';

import {
  createEmptyPlan,
} from '../shared/maker/plan.js';

import {
  validatePlan,
} from '../shared/maker/validation.js';

function createCreditCheck(
  earned,
  projected,
  required
) {
  return {
    earned,
    projected,
    required,
    missing:
      required === null
        ? null
        : Math.max(0, required - projected),
  };
}

test('현재와 예상 학점의 진행률을 구분한다', () => {
  const result = buildCreditProgress(
    createCreditCheck(60, 90, 120)
  );

  assert.equal(result.currentPercent, 50);
  assert.equal(result.projectedPercent, 75);
  assert.equal(result.currentMissing, 60);
  assert.equal(result.projectedMissing, 30);
});

test('졸업 기준을 초과해도 진행률은 100%를 넘지 않는다', () => {
  const result = buildCreditProgress(
    createCreditCheck(140, 150, 133)
  );

  assert.equal(result.earned, 140);
  assert.equal(result.projected, 150);
  assert.equal(result.currentPercent, 100);
  assert.equal(result.projectedPercent, 100);
  assert.equal(result.currentMissing, 0);
});

test('미확인 학점 기준은 진행률을 계산하지 않는다', () => {
  const result = buildCreditProgress(
    createCreditCheck(30, 40, null)
  );

  assert.equal(result.state, 'unknown');
  assert.equal(result.currentPercent, null);
  assert.equal(result.projectedPercent, null);
  assert.equal(result.currentMissing, null);
});

test('요구 학점이 0이면 나눗셈을 수행하지 않는다', () => {
  const result = buildCreditProgress(
    createCreditCheck(0, 0, 0)
  );

  assert.equal(result.state, 'no-requirement');
  assert.equal(result.currentPercent, null);
  assert.equal(result.projectedMissing, 0);
});

test('잘못된 학점 결과를 거부한다', () => {
  assert.throws(() =>
    buildCreditProgress(
      createCreditCheck(-1, 10, 20)
    )
  );

  assert.throws(() =>
    buildCreditProgress(
      createCreditCheck(15, 10, 20)
    )
  );
});

test('실제 교육과정의 전공필수 상태를 구분한다', () => {
  const curriculum = loadRealCurriculum();
  const requiredIds =
    curriculum.requirements.requiredCourseIds;

  const plan = createEmptyPlan(curriculum.curriculumId);

  plan.completedCourses.push({
    courseId: requiredIds[0],
    termId: '2024-1',
    earnedCredits: 3,
  });

  plan.inProgressCourses.push({
    courseId: requiredIds[1],
    termId: '2026-2',
  });

  plan.plannedTerms.push({
    termId: '2027-1',
    courseIds: [requiredIds[2]],
  });

  const progress = buildRequiredCourseProgress(
    plan,
    curriculum
  );

  assert.equal(progress.total, requiredIds.length);
  assert.equal(progress.counts.completed, 1);
  assert.equal(progress.counts.inProgress, 1);
  assert.equal(progress.counts.planned, 1);
  assert.equal(
    progress.counts.unplaced,
    requiredIds.length - 3
  );

  assert.equal(
    progress.courses[0].name,
    curriculum.courses.find(
      (course) => course.id === requiredIds[0]
    ).name
  );
});

test('전공필수 기준이 없으면 확인 필요로 처리한다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);

  const unknownCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      requiredCourseIds: null,
    },
  };

  const progress = buildRequiredCourseProgress(
    plan,
    unknownCurriculum
  );

  assert.equal(progress.state, 'unknown');
  assert.equal(progress.total, null);
  assert.deepEqual(progress.courses, []);
});

test('전공필수 지정 과목이 없는 경우 0개로 처리한다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);

  const emptyCurriculum = {
    ...curriculum,
    requirements: {
      ...curriculum.requirements,
      requiredCourseIds: [],
    },
  };

  const progress = buildRequiredCourseProgress(
    plan,
    emptyCurriculum
  );

  assert.equal(progress.state, 'known');
  assert.equal(progress.total, 0);
  assert.equal(progress.counts.completed, 0);
});

test('실제 검증 결과와 진행 현황이 일치한다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);

  const validation = validatePlan(plan, curriculum);
  const progress = buildDegreeProgress(
    validation,
    plan,
    curriculum
  );

  assert.equal(
    progress.totalCredits.earned,
    validation.checks.totalCredits.earned
  );

  assert.equal(
    progress.totalCredits.projected,
    validation.checks.totalCredits.projected
  );

  assert.equal(
    progress.majorCredits.required,
    curriculum.requirements.minimumMajorCredits
  );

  assert.equal(
    progress.requiredCourses.total,
    curriculum.requirements.requiredCourseIds.length
  );
});

test('검증 전에는 진행 현황을 표시하지 않는다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);

  assert.equal(
    buildDegreeProgress(null, plan, curriculum),
    null
  );
});
