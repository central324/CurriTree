import test from 'node:test';
import assert from 'node:assert/strict';

import { buildMakerPlan } from '../public/klas/plan.js';

const curriculum = {
  curriculumId: 'ce-2023',
  courses: [
    {
      id: 'data-structure-design',
      name: '데이터구조설계',
    },
    {
      id: 'algorithms',
      name: '알고리즘',
    },
    {
      id: 'operating-systems',
      name: '운영체제',
    },
  ],
};

function createRow({
  clientRowId,
  termId = '2025-1',
  name,
  subjectCode,
  credits = 3,
  category = 'major_required',
  completionStatus = 'completed',
  matchStatus = 'exact',
  courseId = 'data-structure-design',
}) {
  return {
    clientRowId,
    termId,
    name: name ?? `가상과목-${clientRowId}`,
    subjectCode: subjectCode ?? `TEST-${clientRowId}`,
    credits,
    category,
    completionStatus,
    match: {
      status: matchStatus,
      courseId,
    },
  };
}

test('Completed major courses are converted into maker records', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      courseId: 'data-structure-design',
      credits: 3,
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, [
    {
      courseId: 'data-structure-design',
      termId: '2025-1',
      earnedCredits: 3,
    },
  ]);

  assert.equal(result.plan.reviewPendingCount, 0);
});

test('In-progress major courses are kept separate', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      completionStatus: 'in_progress',
      termId: '2026-2',
      courseId: 'operating-systems',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);

  assert.deepEqual(result.plan.inProgressCourses, [
    {
      courseId: 'operating-systems',
      termId: '2026-2',
    },
  ]);

  assert.equal(result.plan.reviewPendingCount, 0);
});

test('General education credits use the contract object format', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      category: 'general_required',
      matchStatus: 'unmatched',
      courseId: null,
      credits: 2,
    }),
    createRow({
      clientRowId: 'local-002',
      category: 'general_elective',
      matchStatus: 'unmatched',
      courseId: null,
      credits: 3,
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.otherEarnedCredits, {
    general_required: 2,
    general_elective: 3,
    foundation_required: 0,
    foundation_elective: 0,
    free_elective: 0,
  });

  assert.deepEqual(result.plan.completedCourses, []);
});

test('Deleted and failed records do not earn credits', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      completionStatus: 'deleted',
      termId: '2023-1',
    }),
    createRow({
      clientRowId: 'local-002',
      completionStatus: 'failed',
      termId: '2024-1',
    }),
    createRow({
      clientRowId: 'local-003',
      completionStatus: 'completed',
      termId: '2025-1',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.equal(result.plan.completedCourses.length, 1);
  assert.equal(
    result.plan.completedCourses[0].courseId,
    'data-structure-design'
  );

  assert.equal(result.plan.reviewPendingCount, 0);
});

test('Unmatched major courses remain pending', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      matchStatus: 'unmatched',
      courseId: null,
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);

  assert.deepEqual(result.reviewPendingRowIds, [
    'local-001',
  ]);
});

test('AI suggestions are not automatically accepted', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      matchStatus: 'suggested',
      courseId: null,
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);
});

test('Confirmed course matches are accepted', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      matchStatus: 'confirmed',
      courseId: 'data-structure-design',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.equal(result.plan.completedCourses.length, 1);
  assert.equal(result.plan.reviewPendingCount, 0);
});

test('Unknown course IDs are rejected from completed courses', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      matchStatus: 'confirmed',
      courseId: 'unknown-course-id',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);
});

test('Multiple completed attempts require review', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      termId: '2024-1',
    }),
    createRow({
      clientRowId: 'local-002',
      termId: '2025-1',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 2);

  assert.ok(
    result.historyIssues.some(
      (issue) => issue.reason === 'MULTIPLE_ACTIVE_RECORDS'
    )
  );
});

test('Unknown completion status remains pending', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      completionStatus: 'needs_review',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);
});

test('Completed records without valid credits remain pending', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      credits: null,
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);

  assert.deepEqual(result.plan.completedCourses, []);
  assert.equal(result.plan.reviewPendingCount, 1);
});

test('Maker payload does not expose original course names or grades', () => {
  const rows = [
    createRow({
      clientRowId: 'local-001',
      name: '데이터구조설계',
    }),
  ];

  const result = buildMakerPlan(rows, curriculum);
  const json = JSON.stringify(result.plan);

  assert.equal(json.includes('데이터구조설계'), false);
  assert.equal(json.includes('clientRowId'), false);
  assert.equal(json.includes('grade'), false);
  assert.equal(json.includes('rawText'), false);
});

test('Duplicate row identifiers are rejected', () => {
  const rows = [
    createRow({ clientRowId: 'local-001' }),
    createRow({ clientRowId: 'local-001' }),
  ];

  assert.throws(
    () => buildMakerPlan(rows, curriculum),
    TypeError
  );
});