import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTermId,
  extractSubjectCode,
  classifyCompletionStatus,
  parseKlasText,
} from '../public/klas/parser.js';

test('KLAS semester headings are converted correctly', () => {
  assert.equal(parseTermId('2026학년도 1학기'), '2026-1');
  assert.equal(parseTermId('2026학년도 2학기'), '2026-2');

  assert.equal(
    parseTermId('2026학년도 계절학기(하계)'),
    '2026-S'
  );

  assert.equal(
    parseTermId('2025학년도 계절학기(동계)'),
    '2025-W'
  );

  assert.equal(parseTermId('잘못된 학기'), null);
});

test('Course section numbers are removed only for recognized formats', () => {
  assert.equal(
    extractSubjectCode('I020-2-3703-02'),
    'I020-2-3703'
  );

  assert.equal(
    extractSubjectCode('0000-1-3415-01'),
    '0000-1-3415'
  );

  assert.equal(extractSubjectCode('교류'), null);
});

test('Passing and failing grades are classified correctly', () => {
  const classify = (grade) =>
    classifyCompletionStatus({
      grade,
      termId: '2026-1',
      currentTermId: '2026-2',
    });

  assert.equal(classify('A+'), 'completed');
  assert.equal(classify('A0'), 'completed');
  assert.equal(classify('P'), 'completed');
  assert.equal(classify('F'), 'failed');
  assert.equal(classify('NP'), 'failed');
});

test('Deleted grades take precedence over passing grades', () => {
  assert.equal(
    classifyCompletionStatus({
      grade: 'D+(삭제)',
      termId: '2023-2',
      currentTermId: '2026-2',
    }),
    'deleted'
  );
});

test('Blank grades depend on the actual current semester', () => {
  assert.equal(
    classifyCompletionStatus({
      grade: '',
      termId: '2026-2',
      currentTermId: '2026-2',
    }),
    'in_progress'
  );

  assert.equal(
    classifyCompletionStatus({
      grade: '',
      termId: '2025-2',
      currentTermId: '2026-2',
    }),
    'needs_review'
  );
});

test('Multiple semesters are parsed into course objects', () => {
  const rawText = [
    '2026학년도 2학기',
    '학정번호\t과목명\t개설학과\t이수구분\t학점\t성적\t인증구분\t재수강여부\t재수강이후',
    '삭제여부',
    'I020-2-1111-01\t가상자료구조\t컴퓨터정보공학부\t전필\t3\t\t\t\t',
    '2026학년도 1학기',
    '학정번호\t과목명\t개설학과\t이수구분\t학점\t성적\t인증구분\t재수강여부\t재수강이후',
    '삭제여부',
    'I020-2-2222-01\t가상프로그래밍\t컴퓨터정보공학부\t전선\t3\tA+\t\t\t',
    '2025학년도 계절학기(동계)',
    '0000-1-3333-01\t가상물리학\t전체공통\t교선\t3\tB0\t\t재수강\t',
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(result.courses.length, 3);
  assert.equal(result.warnings.length, 0);

  assert.equal(result.courses[0].termId, '2026-2');
  assert.equal(result.courses[0].category, 'major_required');
  assert.equal(result.courses[0].completionStatus, 'in_progress');

  assert.equal(result.courses[1].termId, '2026-1');
  assert.equal(result.courses[1].completionStatus, 'completed');

  assert.equal(result.courses[2].termId, '2025-W');
  assert.equal(result.courses[2].category, 'general_elective');
});

test('Unknown course information is marked for review', () => {
  const rawText = [
    '2026학년도 1학기',
    'I020-2-9999-01\t가상과목\t컴퓨터정보공학부\t알수없음\t3\tA+\t\t\t',
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].category, 'unknown');
  assert.equal(result.courses[0].completionStatus, 'needs_review');
  assert.equal(result.warnings.length, 1);
});

test('Raw grades are not included in parsed course objects', () => {
  const rawText = [
    '2026학년도 1학기',
    'I020-2-1111-01\t가상자료구조\t컴퓨터정보공학부\t전필\t3\tA+\t\t\t',
  ].join('\n');

  const result = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal('grade' in result.courses[0], false);
  assert.equal('rawText' in result.courses[0], false);
});