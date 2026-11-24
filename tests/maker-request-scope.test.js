import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isMakerRequestCurrent,
} from '../public/maker/request-scope.js';

const curriculum = { curriculumId: 'ce-2023' };
const plan = { curriculumId: 'ce-2023' };

function createState() {
  return {
    version: 1,
    curriculum,
    plan,
    admissionYear: '2023',
    supported: true,
  };
}

test('상태가 변경되지 않은 요청은 유효하다', () => {
  const state = createState();

  assert.equal(
    isMakerRequestCurrent(state, { ...state }),
    true
  );
});

test('미지원 학번에서는 응답을 적용하지 않는다', () => {
  const previous = createState();

  const current = {
    ...previous,
    version: 2,
    admissionYear: '2024',
    supported: false,
  };

  assert.equal(
    isMakerRequestCurrent(previous, current),
    false
  );
});

test('2023 → 2024 → 2023 변경 후에도 이전 요청은 무효다', () => {
  const previous = createState();

  const current = {
    ...previous,
    version: 3,
    admissionYear: '2023',
    supported: true,
  };

  assert.equal(
    isMakerRequestCurrent(previous, current),
    false
  );
});

test('교육과정 객체가 변경되면 이전 요청은 무효다', () => {
  const previous = createState();

  const current = {
    ...previous,
    curriculum: { curriculumId: 'ce-2023' },
  };

  assert.equal(
    isMakerRequestCurrent(previous, current),
    false
  );
});

test('수강 계획이 다른 요청으로 갱신되면 무효다', () => {
  const previous = createState();

  const current = {
    ...previous,
    plan: { curriculumId: 'ce-2023' },
  };

  assert.equal(
    isMakerRequestCurrent(previous, current),
    false
  );
});

test('지원 여부는 boolean true일 때만 인정한다', () => {
  const previous = createState();

  for (const supported of [false, null, 'true', undefined]) {
    assert.equal(
      isMakerRequestCurrent(previous, {
        ...previous,
        supported,
      }),
      false
    );
  }
});

test('잘못된 요청 상태는 안전하게 거부한다', () => {
  const state = createState();

  assert.equal(isMakerRequestCurrent(null, state), false);
  assert.equal(isMakerRequestCurrent(state, null), false);
});

test('늦게 도착한 비동기 응답은 적용 대상에서 제외된다', async () => {
  const requested = createState();
  const applied = [];

  let finishRequest;

  const pending = new Promise((resolve) => {
    finishRequest = resolve;
  });

  let current = { ...requested };

  const operation = pending.then((result) => {
    if (isMakerRequestCurrent(requested, current)) {
      applied.push(result);
    }
  });

  // 요청을 시작한 후 입학년도가 변경된 상황
  current = {
    ...current,
    version: 2,
    admissionYear: '2024',
    supported: false,
  };

  finishRequest({ overallStatus: 'met' });

  await operation;

  assert.deepEqual(applied, []);
});

test('커리메이커의 주요 비동기 작업에 공통 검사가 연결되어 있다', () => {
  const source = readFileSync(
    new URL('../public/maker/maker.js', import.meta.url),
    'utf8'
  );

  const sections = [
    [
      'courseForm.addEventListener("submit"',
      'async function removePlannedCourse(',
    ],
    [
      'async function removePlannedCourse(',
      'async function movePlannedCourse(',
    ],
    [
      'async function movePlannedCourse(',
      'const OTHER_CREDIT_FIELDS =',
    ],
    [
      'applyCreditsButton.addEventListener("click"',
      'const validateButton =',
    ],
    [
      'validateButton.addEventListener("click"',
      'async function removeRecordedCourse(',
    ],
    [
      'async function removeRecordedCourse(',
      '// 페이지 초기 진입 시',
    ],
  ];

  for (const [startText, endText] of sections) {
    const start = source.indexOf(startText);
    const end = source.indexOf(endText, start);

    assert.ok(start >= 0, startText);
    assert.ok(end > start, endText);

    const section = source.slice(start, end);

    assert.match(
      section,
      /const requestScope = captureMakerRequest\(\)/
    );

    assert.match(
      section,
      /isCurrentMakerRequest\(requestScope\)/
    );
  }

  assert.match(
    source,
    /const loadVersion = \+\+makerScopeVersion/
  );

  assert.match(
    source,
    /makerScopeVersion \+= 1/
  );
});
