import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getAdmissionYearSupport,
} from '../shared/curriculum/admission-year.js';

import {
  loadRealCurriculum,
} from './helpers/curriculum.js';

const html = readFileSync(
  new URL('../public/maker/index.html', import.meta.url),
  'utf8'
);

const script = readFileSync(
  new URL('../public/maker/maker.js', import.meta.url),
  'utf8'
);

const curriculum = loadRealCurriculum();

test('커리메이커에 입학년도 입력창이 제공된다', () => {
  assert.match(html, /id="maker-admission-year"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /pattern="\[0-9\]\{4\}"/);
});

test('적용 입학년도 안내 영역이 존재한다', () => {
  assert.match(html, /id="maker-admission-scope"/);
  assert.match(html, /aria-live="polite"/);
});

test('실제 2023학번 교육과정의 지원 여부를 판단한다', () => {
  assert.deepEqual(curriculum.admissionYears, [2023]);

  const supported = getAdmissionYearSupport({
    admissionYear: 2023,
    admissionYears: curriculum.admissionYears,
  });

  const unsupported = getAdmissionYearSupport({
    admissionYear: 2024,
    admissionYears: curriculum.admissionYears,
  });

  assert.equal(supported.status, 'supported');
  assert.equal(unsupported.status, 'unsupported');
});

test('입학년도 지원 여부를 공통 함수로 판단한다', () => {
  assert.match(script, /getAdmissionYearSupport/);
  assert.match(script, /getCurrentAdmissionSupport/);
  assert.match(script, /isAdmissionSupported/);
  assert.match(script, /renderAdmissionScope/);
});

test('지원 학번 확인 전 편집 영역을 잠근다', () => {
  assert.match(script, /section\.inert = !supported/);
  assert.match(script, /validateButton\.disabled = !supported/);
});

test('KLAS 전달 계획은 지원 학번 확인 후 검증한다', () => {
  assert.match(
    script,
    /pendingMakerPlan\.curriculumId === curriculum\.curriculumId &&\s*isAdmissionSupported\(\)/
  );
});

test('입학년도 변경 시 이전 검증 결과를 무효화한다', () => {
  assert.match(
    script,
    /admissionYearInput\.addEventListener\("input"/
  );

  assert.match(script, /renderCreditSummary\(null\)/);
  assert.match(script, /submittedAdmissionYear/);
});

test('미지원 학번에서는 검증 결과를 표시하지 않는다', () => {
  assert.match(
    script,
    /function renderValidationResult\(result\)/
  );

  assert.match(
    script,
    /if \(!isAdmissionSupported\(\)\)/
  );
});

test('검증 요청 중 입학년도가 바뀌면 이전 결과를 무시한다', () => {
  assert.match(
    script,
    /admissionYearInput\.value !== submittedAdmissionYear/
  );

  assert.match(
    script,
    /validateButton\.disabled =\s*!currentPlan \|\| !isAdmissionSupported\(\)/
  );
});

test('변경된 입학년도에는 이전 검증 결과를 적용하지 않는다', () => {
  const start = script.indexOf(
    'validateButton.addEventListener("click", async () => {'
  );

  const end = script.indexOf(
    'async function removeRecordedCourse(',
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const handler = script.slice(start, end);

  // 응답을 받은 뒤 입학년도 변경 여부를 확인합니다.
  assert.match(
    handler,
    /admissionYearInput\.value !== submittedAdmissionYear/
  );

  // 기존 결과를 무시하고 즉시 종료해야 합니다.
  assert.match(
    handler,
    /!isAdmissionSupported\(\)\s*\)\s*\{\s*return;\s*\}/
  );
});
