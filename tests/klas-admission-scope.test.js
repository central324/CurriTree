import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(
  new URL('../public/klas/index.html', import.meta.url),
  'utf8'
);

const script = readFileSync(
  new URL('../public/klas/klas.js', import.meta.url),
  'utf8'
);

test('KLAS 화면에 입학년도 입력 필드가 제공된다', () => {
  assert.match(html, /id="admission-year"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /pattern="\[0-9\]\{4\}"/);
});

test('교육과정 적용 학번 안내 영역이 존재한다', () => {
  assert.match(html, /id="admission-scope"/);
  assert.match(html, /aria-live="polite"/);
});

test('입학년도 지원 여부 공통 함수를 사용한다', () => {
  assert.match(script, /getAdmissionYearSupport/);
  assert.match(script, /getSelectedAdmissionSupport/);
  assert.match(script, /renderAdmissionScope/);
});

test('입학년도 변경 시 분석 상태를 초기화한다', () => {
  assert.match(
    script,
    /admissionYearInput\.addEventListener\('input', updateInputState\)/
  );
});

test('지원 학번인 경우에만 분석 버튼을 활성화한다', () => {
  assert.match(
    script,
    /support\?\.status === 'supported'/
  );
});

test('실제 교육과정 상세 데이터로 지원 여부를 재검증한다', () => {
  assert.match(
    script,
    /admissionYears: curriculum\.admissionYears/
  );

  assert.match(
    script,
    /verifiedSupport\.status !== 'supported'/
  );
});

test('분석 결과에 적용 교육과정을 표시한다', () => {
  assert.match(script, /klas__result-scope/);
  assert.match(script, /실제 졸업요건은 학교의 공식/);
});
