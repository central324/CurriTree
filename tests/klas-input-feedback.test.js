import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isValidCurrentTerm,
  getKlasInputHint,
  getKlasWarningGuidance,
  getKlasLineSelection,
} from '../public/klas/input-feedback.js';

import { parseKlasText } from '../public/klas/parser.js';

test('현재 학기 형식을 검증한다', () => {
  assert.equal(isValidCurrentTerm('2026-1'), true);
  assert.equal(isValidCurrentTerm('2026-2'), true);
  assert.equal(isValidCurrentTerm('2026-S'), true);
  assert.equal(isValidCurrentTerm('2026-W'), true);

  assert.equal(isValidCurrentTerm('2026-3'), false);
  assert.equal(isValidCurrentTerm('2026학년도 2학기'), false);
  assert.equal(isValidCurrentTerm(''), false);
});

test('빈 입력에 대해 구체적인 안내를 제공한다', () => {
  const hint = getKlasInputHint('   ', '2026-2');

  assert.match(hint, /KLAS 성적조회 텍스트/);
  assert.match(hint, /복사 가이드/);
});

test('잘못된 현재 학기 형식을 안내한다', () => {
  const hint = getKlasInputHint(
    '2026학년도 1학기',
    '2026-3'
  );

  assert.match(hint, /현재 학기/);
  assert.match(hint, /2026-2/);
});

test('올바른 입력에는 오류 안내를 표시하지 않는다', () => {
  assert.equal(
    getKlasInputHint('2026학년도 1학기', '2026-2'),
    ''
  );
});

test('경고 코드마다 수정 방법을 제공한다', () => {
  assert.match(
    getKlasWarningGuidance('ROW_FORMAT_INVALID'),
    /학정번호/
  );

  assert.match(
    getKlasWarningGuidance('TERM_FORMAT_INVALID'),
    /학기 제목/
  );

  assert.match(
    getKlasWarningGuidance('TERM_NOT_FOUND'),
    /소속 학기/
  );

  assert.match(
    getKlasWarningGuidance('COURSE_INFORMATION_INCOMPLETE'),
    /학점 또는 이수구분/
  );
});

test('오류가 발생한 줄의 선택 범위를 계산한다', () => {
  const rawText = [
    '2026학년도 1학기',
    '첫 번째 과목',
    '잘못된 과목 행',
    '마지막 과목',
  ].join('\n');

  const selection = getKlasLineSelection(rawText, 3);

  assert.ok(selection);

  assert.equal(
    rawText.slice(selection.start, selection.end),
    '잘못된 과목 행'
  );

  assert.equal(getKlasLineSelection(rawText, 0), null);
  assert.equal(getKlasLineSelection(rawText, 10), null);
});

test('일부 과목 행이 잘못되어도 정상 과목은 유지한다', () => {
  const validRow = [
    'I020-2-3703-01',
    '데이터구조설계',
    '컴퓨터정보공학부',
    '전필',
    '3',
    'A0',
    '',
    '',
    '',
  ].join('\t');

  const rawText = [
    '2026학년도 1학기',
    validRow,
    '잘못된 과목',
  ].join('\n');

  const parsed = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(parsed.courses.length, 1);
  assert.equal(parsed.courses[0].name, '데이터구조설계');

  assert.deepEqual(parsed.warnings, [
    {
      lineNumber: 3,
      reason: 'ROW_FORMAT_INVALID',
    },
  ]);

  const selection = getKlasLineSelection(
    rawText,
    parsed.warnings[0].lineNumber
  );

  assert.equal(
    rawText.slice(selection.start, selection.end),
    '잘못된 과목'
  );
});

test('과목이 하나도 없는 경우에도 파싱 경고를 반환한다', () => {
  const parsed = parseKlasText(
    '2026학년도 3학기\n잘못된 과목',
    { currentTermId: '2026-2' }
  );

  assert.equal(parsed.courses.length, 0);

  assert.deepEqual(
    parsed.warnings.map((warning) => warning.reason),
    ['TERM_FORMAT_INVALID', 'ROW_FORMAT_INVALID']
  );
});

test('KLAS 화면에 오류 줄 이동 기능이 연결되어 있다', () => {
  const script = readFileSync(
    new URL('../public/klas/klas.js', import.meta.url),
    'utf8'
  );

  assert.match(
    script,
    /getKlasLineSelection/
  );

  assert.match(
    script,
    /setSelectionRange/
  );

  assert.match(
    script,
    /focusInputLine\(warning\.lineNumber\)/
  );
});
