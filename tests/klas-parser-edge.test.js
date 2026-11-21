import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseKlasText,
} from '../public/klas/parser.js';

function createCourseRow(code, name, grade = 'A0') {
  return [
    code,
    name,
    '컴퓨터정보공학부',
    '전필',
    '3',
    grade,
    '',
    '',
    '',
  ].join('\t');
}

test('KLAS table headers with extra spaces are ignored', () => {
  const rawText = [
    ' 2026학년도 1학기 ',
    '  학정번호 \t과목명\t개설학과\t이수구분\t학점\t성적',
    ' 재수강이후 ',
    ' 삭제여부 ',
    createCourseRow(
      'I020-2-3703-01',
      '데이터구조설계'
    ),
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].name, '데이터구조설계');
  assert.equal(result.courses[0].termId, '2026-1');
  assert.equal(result.warnings.length, 0);
});

test('Malformed rows do not discard valid course rows', () => {
  const rawText = [
    '2026학년도 1학기',
    createCourseRow(
      'I020-2-3703-01',
      '데이터구조설계'
    ),
    'I020-2-9999-01\t잘린과목\t컴퓨터정보공학부',
    createCourseRow(
      'I020-2-0454-01',
      '디지털논리회로2',
      'B0'
    ),
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(result.courses.length, 2);

  assert.deepEqual(
    result.courses.map((course) => course.name),
    ['데이터구조설계', '디지털논리회로2']
  );

  assert.deepEqual(result.warnings, [
    {
      lineNumber: 3,
      reason: 'ROW_FORMAT_INVALID',
    },
  ]);
});

test('Unsupported semester headings do not reuse the previous term', () => {
  const rawText = [
    '2026학년도 1학기',
    createCourseRow(
      'I020-2-3703-01',
      '데이터구조설계'
    ),
    '2026학년도 3학기',
    createCourseRow(
      'I020-2-9999-01',
      '가상과목'
    ),
    '2026학년도 2학기',
    createCourseRow(
      'I020-2-0454-01',
      '디지털논리회로2',
      ''
    ),
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(result.courses.length, 2);

  assert.deepEqual(
    result.courses.map((course) => course.termId),
    ['2026-1', '2026-2']
  );

  assert.equal(
    result.courses[1].completionStatus,
    'in_progress'
  );

  assert.deepEqual(result.warnings, [
    {
      lineNumber: 3,
      reason: 'TERM_FORMAT_INVALID',
    },
    {
      lineNumber: 4,
      reason: 'TERM_NOT_FOUND',
    },
  ]);
});
