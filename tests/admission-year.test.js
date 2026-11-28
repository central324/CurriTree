import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAdmissionYearSupport,
} from '../shared/curriculum/admission-year.js';

const admissionYears = [2023];

function check(admissionYear, years = admissionYears) {
  return getAdmissionYearSupport({
    admissionYear,
    admissionYears: years,
  });
}

test('2023학번은 지원 대상으로 판단한다', () => {
  const result = check(2023);

  assert.equal(result.status, 'supported');
  assert.equal(result.admissionYear, 2023);
  assert.deepEqual(result.supportedYears, [2023]);
});

test('문자열 입학년도도 정상 처리한다', () => {
  const result = check(' 2023 ');

  assert.equal(result.status, 'supported');
  assert.equal(result.admissionYear, 2023);
});

test('2023학번만 지원하는 교육과정에서는 2022학번과 2024학번을 차단한다', () => {
  for (const year of [2022, 2024]) {
    const result = check(year);

    assert.equal(result.status, 'unsupported');
    assert.equal(result.admissionYear, year);
    assert.deepEqual(result.supportedYears, [2023]);
  }
});

test('입학년도 미선택 상태를 구분한다', () => {
  for (const value of [null, undefined, '', '   ']) {
    const result = check(value);

    assert.equal(result.status, 'unselected');
    assert.equal(result.admissionYear, null);
  }
});

test('잘못된 입학년도 입력을 거부한다', () => {
  const invalidValues = [
    23,
    '23',
    '23학번',
    '2023학번',
    '2023.0',
    '0000',
    -2023,
    2023.5,
    NaN,
    Infinity,
    true,
    [],
    {},
  ];

  for (const value of invalidValues) {
    const result = check(value);

    assert.equal(
      result.status,
      'invalid',
      `입력값: ${String(value)}`
    );

    assert.equal(result.admissionYear, null);
  }
});

test('여러 입학년도를 지원하는 교육과정도 처리한다', () => {
  const years = [2023, 2024, 2025];

  assert.equal(
    check(2023, years).status,
    'supported'
  );

  assert.equal(
    check(2024, years).status,
    'supported'
  );

  assert.equal(
    check(2025, years).status,
    'supported'
  );

  assert.equal(
    check(2026, years).status,
    'unsupported'
  );
});

test('2023학번 고정 없이 다른 교육과정에도 적용한다', () => {
  const result = check('2027', [2026, 2027]);

  assert.equal(result.status, 'supported');
  assert.equal(result.admissionYear, 2027);
  assert.deepEqual(result.supportedYears, [2026, 2027]);
});

test('교육과정의 입학년도 데이터가 잘못되면 오류를 발생시킨다', () => {
  const invalidYears = [
    null,
    undefined,
    [],
    '2023',
    [2023, '2024'],
    [2023, null],
    [2023, 2024.5],
    [0],
  ];

  for (const years of invalidYears) {
    assert.throws(
      () => getAdmissionYearSupport({
        admissionYear: 2023,
        admissionYears: years,
      }),
      TypeError,
      `잘못된 교육과정 데이터: ${String(years)}`
    );
  }
});

test('원본 교육과정 데이터를 변경하지 않는다', () => {
  const years = [2023, 2024];

  const result = check(2023, years);

  assert.deepEqual(years, [2023, 2024]);
  assert.deepEqual(result.supportedYears, [2023, 2024]);

  result.supportedYears.push(2025);

  // 반환값을 변경해도 원본 데이터는 유지됩니다.
  assert.deepEqual(years, [2023, 2024]);
});
