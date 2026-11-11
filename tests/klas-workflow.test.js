import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { buildMakerPlan } from '../public/klas/plan.js';

const curriculum = {
  schemaVersion: 1,
  curriculumId: 'ce-2026',
  courses: [
    {
      id: 'data-structure-design',
      name: '데이터구조설계',
      aliases: [],
      courseCodes: [],
    },
    {
      id: 'algorithms',
      name: '알고리즘',
      aliases: [],
      courseCodes: [],
    },
  ],
};

function klasRow(code, name, category, credits, grade) {
  return [
    code,
    name,
    '컴퓨터정보공학부',
    category,
    String(credits),
    grade,
    '',
    '',
    '',
  ].join('\t');
}

function processKlasText(rawText) {
  const parsed = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  const majorRows = parsed.courses.filter(
    (course) =>
      course.category === 'major_required' ||
      course.category === 'major_elective'
  );

  const matched = matchParsedCourses(majorRows, curriculum);

  const matchedMap = new Map(
    matched.courses.map((course) => [
      course.clientRowId,
      course,
    ])
  );

  const rows = parsed.courses.map(
    (course) =>
      matchedMap.get(course.clientRowId) ?? course
  );

  return {
    parsed,
    matched,
    rows,
    result: buildMakerPlan(rows, curriculum),
  };
}

test('KLAS text is converted into a complete maker plan', () => {
  const rawText = [
    '2024학년도 1학기',
    klasRow(
      'I020-2-1111-01',
      '데이터구조설계',
      '전필',
      3,
      'F'
    ),
    '2025학년도 1학기',
    klasRow(
      'I020-2-1111-02',
      '데이터구조설계',
      '전필',
      3,
      'A+'
    ),
    klasRow(
      '0000-1-2222-01',
      '가상교양과목',
      '교선',
      3,
      'B0'
    ),
    '2026학년도 2학기',
    klasRow(
      'I020-2-3333-01',
      '알고리즘',
      '전선',
      3,
      ''
    ),
  ].join('\n');

  const { result } = processKlasText(rawText);
  const { plan } = result;

  assert.deepEqual(plan.completedCourses, [
    {
      courseId: 'data-structure-design',
      termId: '2025-1',
      earnedCredits: 3,
    },
  ]);

  assert.deepEqual(plan.inProgressCourses, [
    {
      courseId: 'algorithms',
      termId: '2026-2',
    },
  ]);

  assert.equal(
    plan.otherEarnedCredits.general_elective,
    3
  );

  assert.equal(plan.reviewPendingCount, 0);
});

test('Unmatched courses remain pending until user confirmation', () => {
  const rawText = [
    '2025학년도 1학기',
    klasRow(
      'I020-2-5555-01',
      '자료구조설계',
      '전필',
      3,
      'A+'
    ),
  ].join('\n');

  const { rows, result } = processKlasText(rawText);

  assert.equal(rows[0].match.status, 'unmatched');

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);

  const confirmedRows = rows.map((row) => ({
    ...row,
    match: {
      status: 'confirmed',
      courseId: 'data-structure-design',
    },
  }));

  const confirmed = buildMakerPlan(
    confirmedRows,
    curriculum
  );

  assert.equal(confirmed.plan.completedCourses.length, 1);
  assert.equal(confirmed.plan.reviewPendingCount, 0);
});

test('Final maker payload excludes KLAS source information', () => {
  const rawText = [
    '2025학년도 1학기',
    klasRow(
      'I020-2-1111-01',
      '데이터구조설계',
      '전필',
      3,
      'A+'
    ),
  ].join('\n');

  const { result } = processKlasText(rawText);

  const serialized = JSON.stringify(result.plan);

  assert.equal(serialized.includes('데이터구조설계'), false);
  assert.equal(serialized.includes('I020-2-1111'), false);
  assert.equal(serialized.includes('clientRowId'), false);
  assert.equal(serialized.includes('rawText'), false);

  assert.equal(result.plan.schemaVersion, 1);
  assert.equal(result.plan.curriculumId, 'ce-2026');
});