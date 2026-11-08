import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCourseName,
  normalizeCourseCode,
  matchParsedCourses,
} from '../public/klas/matcher.js';

const curriculum = {
  schemaVersion: 1,
  curriculumId: 'test-curriculum',
  courses: [
    {
      id: 'demo-ds',
      name: '자료구조',
      aliases: ['데이터구조설계'],
      courseCodes: ['I020-2-9999'],
    },
    {
      id: 'demo-algo',
      name: '알고리즘',
      aliases: [],
      courseCodes: ['I020-2-9998'],
    },
    {
      id: 'demo-db',
      name: '데이터베이스',
      aliases: ['DB기초'],
      courseCodes: [],
    },
  ],
};

function createRow({
  clientRowId = 'local-001',
  name,
  subjectCode = null,
  match = {
    status: 'unmatched',
    courseId: null,
  },
}) {
  return {
    clientRowId,
    name,
    subjectCode,
    match,
  };
}

test('Course names are normalized consistently', () => {
  assert.equal(
    normalizeCourseName('데이터 구조 설계'),
    normalizeCourseName('데이터구조설계')
  );

  assert.equal(
    normalizeCourseCode(' i020-2-9999 '),
    'I020-2-9999'
  );
});

test('Courses are matched by subject code', () => {
  const rows = [
    createRow({
      name: '변경된과목명',
      subjectCode: 'I020-2-9999',
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.status, 'exact');
  assert.equal(result.courses[0].match.courseId, 'demo-ds');
});

test('Courses are matched by normalized name', () => {
  const rows = [
    createRow({
      name: '자 료 구 조',
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.status, 'exact');
  assert.equal(result.courses[0].match.courseId, 'demo-ds');
});

test('Courses are matched by aliases', () => {
  const rows = [
    createRow({
      name: '데이터구조설계',
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.courseId, 'demo-ds');
});

test('Conflicting code and name matches require review', () => {
  const rows = [
    createRow({
      name: '알고리즘',
      subjectCode: 'I020-2-9999',
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.status, 'unmatched');

  assert.equal(
    result.reviewIssues[0].reason,
    'CODE_NAME_CONFLICT'
  );
});

test('Ambiguous course names are not automatically matched', () => {
  const ambiguousCurriculum = {
    courses: [
      {
        id: 'course-a',
        name: '프로그래밍',
        aliases: [],
        courseCodes: [],
      },
      {
        id: 'course-b',
        name: '프로그래밍',
        aliases: [],
        courseCodes: [],
      },
    ],
  };

  const result = matchParsedCourses(
    [createRow({ name: '프로그래밍' })],
    ambiguousCurriculum
  );

  assert.equal(result.courses[0].match.status, 'unmatched');

  assert.equal(
    result.reviewIssues[0].reason,
    'AMBIGUOUS_NAME'
  );
});

test('Unknown courses remain unmatched', () => {
  const rows = [
    createRow({
      name: '존재하지않는과목',
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.status, 'unmatched');
  assert.equal(result.courses[0].match.courseId, null);

  assert.equal(result.reviewIssues[0].reason, 'NO_MATCH');
});

test('Confirmed matches are preserved', () => {
  const rows = [
    createRow({
      name: '자료구조',
      match: {
        status: 'confirmed',
        courseId: 'demo-ds',
      },
    }),
  ];

  const result = matchParsedCourses(rows, curriculum);

  assert.equal(result.courses[0].match.status, 'confirmed');
  assert.equal(result.courses[0].match.courseId, 'demo-ds');
});

test('Matching does not mutate the original rows', () => {
  const originalRow = createRow({
    name: '자료구조',
  });

  const rows = [originalRow];

  matchParsedCourses(rows, curriculum);

  assert.equal(originalRow.match.status, 'unmatched');
  assert.equal(originalRow.match.courseId, null);
});