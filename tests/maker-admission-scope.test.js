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

// 이수요건 검증 버튼의 이벤트 처리 코드만 추출합니다.
function getValidationHandler() {
  const start = script.indexOf(
    'validateButton.addEventListener("click", async () => {'
  );

  const end = script.indexOf(
    'async function removeRecordedCourse(',
    start
  );

  assert.ok(start >= 0, '검증 버튼 이벤트를 찾을 수 없습니다.');
  assert.ok(end > start, '검증 버튼 이벤트 범위가 올바르지 않습니다.');

  return script.slice(start, end);
}

// 1. 입학년도 입력창
test('커리메이커에 입학년도 입력창이 제공된다', () => {
  assert.match(html, /id="maker-admission-year"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /pattern="\[0-9\]\{4\}"/);
});

// 2. 적용 입학년도 안내
test('적용 입학년도 안내 영역이 존재한다', () => {
  assert.match(html, /id="maker-admission-scope"/);
  assert.match(html, /aria-live="polite"/);
});

// 3. 실제 교육과정 지원 여부
test('실제 교육과정은 2022학번과 2023학번을 지원한다', () => {
  assert.deepEqual(curriculum.admissionYears, [2022, 2023]);

  for (const admissionYear of [2022, 2023]) {
    const result = getAdmissionYearSupport({
      admissionYear,
      admissionYears: curriculum.admissionYears,
    });

    assert.equal(result.status, 'supported');
    assert.equal(result.admissionYear, admissionYear);
    assert.deepEqual(result.supportedYears, [2022, 2023]);
  }
});

test('지원 범위에 포함되지 않은 학번은 계속 차단한다', () => {
  for (const admissionYear of [2021, 2024, 2025, 2026]) {
    const result = getAdmissionYearSupport({
      admissionYear,
      admissionYears: curriculum.admissionYears,
    });

    assert.equal(result.status, 'unsupported');
    assert.equal(result.admissionYear, admissionYear);
    assert.deepEqual(result.supportedYears, [2022, 2023]);
  }
});

// 4. 공통 함수 사용
test('입학년도 지원 여부를 공통 함수로 판단한다', () => {
  assert.match(script, /getAdmissionYearSupport/);
  assert.match(script, /getCurrentAdmissionSupport/);
  assert.match(script, /isAdmissionSupported/);
  assert.match(script, /renderAdmissionScope/);
});

// 5. 미지원 학번 화면 보호
test('지원 학번 확인 전 편집 영역을 잠근다', () => {
  assert.match(
    script,
    /section\.inert = !supported/
  );

  assert.match(
    script,
    /validateButton\.disabled = !supported/
  );
});

// 6. KLAS 전달 계획 검증 보호
test('KLAS 전달 계획은 지원 학번 확인 후 검증한다', () => {
  assert.match(
    script,
    /pendingMakerPlan\.curriculumId === curriculum\.curriculumId &&\s*isAdmissionSupported\(\)/
  );
});

// 7. 입학년도 변경 시 검증 결과 무효화
test('입학년도 변경 시 이전 검증 결과를 무효화한다', () => {
  assert.match(
    script,
    /admissionYearInput\.addEventListener\("input"/
  );

  // 변경된 상태를 구분하기 위한 버전 관리
  assert.match(
    script,
    /makerScopeVersion \+= 1/
  );

  // 기존 학점 검증 결과 초기화
  assert.match(
    script,
    /renderCreditSummary\(null\)/
  );
});

// 8. 미지원 학번 검증 결과 표시 차단
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

// 9. 비동기 요청 중 입학년도 변경 보호
test('검증 요청 중 입학년도가 바뀌면 이전 결과를 무시한다', () => {
  const handler = getValidationHandler();

  // 요청을 시작할 때 상태를 기록합니다.
  assert.match(
    handler,
    /const requestScope = captureMakerRequest\(\)/
  );

  // 응답을 받은 뒤 상태가 달라졌다면 종료합니다.
  assert.match(
    handler,
    /if \(!isCurrentMakerRequest\(requestScope\)\)\s*\{\s*return;/
  );

  // 미지원 상태에서 검증 버튼이 활성화되지 않아야 합니다.
  assert.match(
    handler,
    /validateButton\.disabled =\s*!currentPlan \|\| !isAdmissionSupported\(\)/
  );
});

// 10. 이전 검증 응답 및 오류 메시지 무효화
test('변경된 입학년도에는 이전 검증 결과를 적용하지 않는다', () => {
  const handler = getValidationHandler();

  const guardIndex = handler.indexOf(
    'if (!isCurrentMakerRequest(requestScope))'
  );

  const renderIndex = handler.indexOf(
    'renderValidationResult(result)'
  );

  // 요청 유효성 검사 후 검증 결과를 표시합니다.
  assert.ok(
    guardIndex >= 0,
    '이전 요청 무효화 조건이 없습니다.'
  );

  assert.ok(
    renderIndex > guardIndex,
    '검증 결과를 유효성 검사보다 먼저 표시하고 있습니다.'
  );

  // 이전 요청에서 발생한 오류도 표시하지 않습니다.
  assert.match(
    handler,
    /catch \(error\)\s*\{\s*if \(isCurrentMakerRequest\(requestScope\)\)/
  );
});
