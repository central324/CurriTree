import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  saveMakerTransfer,
  consumeMakerTransfer,
  resolveTransferAdmissionYear,
} from '../public/klas/admission-handoff.js';

import { loadRealCurriculum } from './helpers/curriculum.js';

const curriculum = loadRealCurriculum();

const PLAN_KEY = 'curritree:maker-handoff:v1';
const ADMISSION_KEY = 'curritree:maker-admission:v1';

function createPlan() {
  return {
    schemaVersion: 1,
    curriculumId: curriculum.curriculumId,
    completedCourses: [
      {
        courseId: 'data-structure-design',
        termId: '2025-1',
        earnedCredits: 3,
      },
    ],
    inProgressCourses: [],
    otherEarnedCredits: {
      general_required: 0,
      general_elective: 0,
      foundation_required: 0,
      foundation_elective: 0,
      free_elective: 0,
    },
    plannedTerms: [],
    reviewPendingCount: 0,
  };
}

function createStorage({ failPlanWrite = false } = {}) {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },

    setItem(key, value) {
      if (failPlanWrite && key === PLAN_KEY) {
        throw new Error('저장소 쓰기 실패');
      }

      values.set(key, String(value));
    },

    removeItem(key) {
      values.delete(key);
    },
  };
}

function save(storage, admissionYear = 2023) {
  saveMakerTransfer(storage, {
    plan: createPlan(),
    curriculum,
    admissionYear,
  });
}

test('2023학번 수강 계획과 입학년도를 함께 전달한다', () => {
  const storage = createStorage();
  const plan = createPlan();

  save(storage);

  const received = consumeMakerTransfer(storage);

  assert.deepEqual(received.plan, plan);

  assert.deepEqual(received.admissionContext, {
    curriculumId: 'ce-2023',
    admissionYear: 2023,
  });

  assert.equal(
    resolveTransferAdmissionYear(
      received.plan,
      received.admissionContext,
      curriculum
    ),
    2023
  );
});

test('기존 수강 계획 JSON 계약을 변경하지 않는다', () => {
  const storage = createStorage();

  save(storage);

  const storedPlan = JSON.parse(storage.getItem(PLAN_KEY));
  const storedAdmission = JSON.parse(
    storage.getItem(ADMISSION_KEY)
  );

  assert.deepEqual(storedPlan, createPlan());

  assert.equal(storedPlan.schemaVersion, 1);
  assert.equal(storedPlan.admissionYear, undefined);
  assert.equal(storedPlan.admissionContext, undefined);

  assert.deepEqual(storedAdmission, {
    curriculumId: 'ce-2023',
    admissionYear: 2023,
  });
});

test('문자열 입학년도를 정수로 정규화한다', () => {
  const storage = createStorage();

  save(storage, ' 2023 ');

  const result = consumeMakerTransfer(storage);

  assert.equal(result.admissionContext.admissionYear, 2023);
});

test('미지원 학번은 전달하지 않는다', () => {
  const storage = createStorage();

  assert.throws(
    () => save(storage, 2024),
    TypeError
  );

  assert.equal(storage.getItem(PLAN_KEY), null);
  assert.equal(storage.getItem(ADMISSION_KEY), null);
});

test('잘못된 입학년도는 전달하지 않는다', () => {
  for (const year of [
    null,
    '',
    '23학번',
    '2023학번',
    '202A',
  ]) {
    const storage = createStorage();

    assert.throws(
      () => save(storage, year),
      TypeError
    );

    assert.equal(storage.getItem(PLAN_KEY), null);
    assert.equal(storage.getItem(ADMISSION_KEY), null);
  }
});

test('수강 계획과 교육과정 ID가 다르면 저장하지 않는다', () => {
  const storage = createStorage();
  const plan = createPlan();

  plan.curriculumId = 'ce-2024';

  assert.throws(
    () => saveMakerTransfer(storage, {
      plan,
      curriculum,
      admissionYear: 2023,
    }),
    TypeError
  );

  assert.equal(storage.getItem(PLAN_KEY), null);
  assert.equal(storage.getItem(ADMISSION_KEY), null);
});

test('손상된 입학년도 정보는 무시하고 계획은 유지한다', () => {
  const storage = createStorage();

  save(storage);
  storage.setItem(ADMISSION_KEY, '{invalid-json');

  const received = consumeMakerTransfer(storage);

  assert.deepEqual(received.plan, createPlan());
  assert.equal(received.admissionContext, null);
  assert.equal(storage.getItem(ADMISSION_KEY), null);
});

test('다른 교육과정의 입학년도는 자동으로 적용하지 않는다', () => {
  const storage = createStorage();

  save(storage);

  storage.setItem(
    ADMISSION_KEY,
    JSON.stringify({
      curriculumId: 'ce-2024',
      admissionYear: 2023,
    })
  );

  const received = consumeMakerTransfer(storage);

  assert.deepEqual(received.plan, createPlan());
  assert.equal(received.admissionContext, null);
});

test('수강 계획이 없으면 남아 있는 입학년도도 무시한다', () => {
  const storage = createStorage();

  storage.setItem(
    ADMISSION_KEY,
    JSON.stringify({
      curriculumId: 'ce-2023',
      admissionYear: 2023,
    })
  );

  const received = consumeMakerTransfer(storage);

  assert.equal(received.plan, null);
  assert.equal(received.admissionContext, null);
  assert.equal(storage.getItem(ADMISSION_KEY), null);
});

test('교육과정의 지원 학번이 달라지면 자동 입력하지 않는다', () => {
  const storage = createStorage();

  save(storage);

  const received = consumeMakerTransfer(storage);

  const changedCurriculum = {
    ...curriculum,
    admissionYears: [2024],
  };

  assert.equal(
    resolveTransferAdmissionYear(
      received.plan,
      received.admissionContext,
      changedCurriculum
    ),
    null
  );
});

test('저장 실패 시 부분 전달 데이터를 정리한다', () => {
  const storage = createStorage({
    failPlanWrite: true,
  });

  assert.throws(
    () => save(storage),
    /저장소 쓰기 실패/
  );

  assert.equal(storage.getItem(PLAN_KEY), null);
  assert.equal(storage.getItem(ADMISSION_KEY), null);
});

test('전달 데이터는 일회성으로 사용한다', () => {
  const storage = createStorage();

  save(storage);

  const first = consumeMakerTransfer(storage);
  const second = consumeMakerTransfer(storage);

  assert.ok(first.plan);
  assert.ok(first.admissionContext);

  assert.equal(second.plan, null);
  assert.equal(second.admissionContext, null);
});

test('KLAS와 커리메이커가 새로운 전달 모듈을 사용한다', () => {
  const klas = readFileSync(
    new URL('../public/klas/klas.js', import.meta.url),
    'utf8'
  );

  const maker = readFileSync(
    new URL('../public/maker/maker.js', import.meta.url),
    'utf8'
  );

  assert.match(
    klas,
    /saveMakerTransfer\(window\.sessionStorage,\s*\{/
  );

  assert.match(
    maker,
    /consumeMakerTransfer\(\s*window\.sessionStorage\s*\)/
  );

  assert.match(
    maker,
    /resolveTransferAdmissionYear\(/
  );
});

test('저장 실패 시 기존 임시 수강 계획을 삭제하지 않는다', () => {
  const underlying = createStorage();

  // 기존에 전달 대기 중이던 수강 계획
  const previousPlan = createPlan();
  previousPlan.reviewPendingCount = 2;

  underlying.setItem(
    PLAN_KEY,
    JSON.stringify(previousPlan)
  );

  // 새로운 계획 저장만 실패하도록 설정
  const failingStorage = {
    getItem(key) {
      return underlying.getItem(key);
    },

    setItem(key, value) {
      if (key === PLAN_KEY) {
        throw new Error('저장소 쓰기 실패');
      }

      underlying.setItem(key, value);
    },

    removeItem(key) {
      underlying.removeItem(key);
    },
  };

  assert.throws(
    () => save(failingStorage),
    /저장소 쓰기 실패/
  );

  // 이전 계획은 그대로 남아 있어야 합니다.
  assert.deepEqual(
    JSON.parse(underlying.getItem(PLAN_KEY)),
    previousPlan
  );

  // 실패한 신규 입학년도 정보는 남기지 않습니다.
  assert.equal(
    underlying.getItem(ADMISSION_KEY),
    null
  );
});
