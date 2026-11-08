import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeCourseHistory,
} from '../public/klas/history.js';

function createRow(
  clientRowId,
  completionStatus,
  {
    termId = '2026-1',
    name = '가상과목',
    subjectCode = 'I020-2-9999',
    courseId = 'demo-course',
  } = {}
) {
  return {
    clientRowId,
    termId,
    name,
    subjectCode,
    completionStatus,
    match: courseId
      ? {
          status: 'exact',
          courseId,
        }
      : {
          status: 'unmatched',
          courseId: null,
        },
  };
}

test('Deleted records are excluded from completed candidates', () => {
  const rows = [
    createRow('old', 'deleted', {
      termId: '2023-2',
    }),
    createRow('new', 'completed', {
      termId: '2025-W',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, ['new']);
  assert.deepEqual(result.excludedRowIds, ['old']);
  assert.deepEqual(result.reviewPendingRowIds, []);
});

test('A failed attempt followed by completion is handled correctly', () => {
  const rows = [
    createRow('first', 'failed', {
      termId: '2024-1',
    }),
    createRow('second', 'completed', {
      termId: '2025-1',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, ['second']);
  assert.deepEqual(result.excludedRowIds, ['first']);
});

test('Multiple completed records require review', () => {
  const rows = [
    createRow('first', 'completed', {
      termId: '2024-1',
    }),
    createRow('second', 'completed', {
      termId: '2025-1',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);
  assert.equal(result.reviewPendingRowIds.length, 2);

  assert.equal(
    result.reviewIssues[0].reason,
    'MULTIPLE_ACTIVE_RECORDS'
  );
});

test('A completed course being retaken requires review', () => {
  const rows = [
    createRow('completed', 'completed', {
      termId: '2025-1',
    }),
    createRow('retaking', 'in_progress', {
      termId: '2026-2',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);
  assert.deepEqual(result.inProgressCandidates, []);

  assert.equal(
    result.reviewIssues[0].reason,
    'MULTIPLE_ACTIVE_RECORDS'
  );
});

test('A later failed attempt requires manual confirmation', () => {
  const rows = [
    createRow('completed', 'completed', {
      termId: '2025-1',
    }),
    createRow('failed-again', 'failed', {
      termId: '2026-1',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);

  assert.equal(
    result.reviewIssues[0].reason,
    'LATER_ATTEMPT_UNCERTAIN'
  );
});

test('Uncertain records prevent automatic selection', () => {
  const rows = [
    createRow('completed', 'completed', {
      termId: '2025-1',
    }),
    createRow('unknown', 'needs_review', {
      termId: '2026-1',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);

  assert.equal(
    result.reviewIssues[0].reason,
    'STATUS_UNCERTAIN'
  );
});

test('The same name with different codes requires review', () => {
  const rows = [
    createRow('first', 'completed', {
      name: '가상물리학',
      subjectCode: 'H000-1-9999',
      courseId: null,
      termId: '2024-1',
    }),
    createRow('second', 'completed', {
      name: '가상물리학',
      subjectCode: '0000-1-9999',
      courseId: null,
      termId: '2025-1',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);

  assert.ok(
    result.reviewIssues.some(
      (issue) => issue.reason === 'POSSIBLE_SAME_COURSE'
    )
  );
});

test('Records without a reliable course identity require review', () => {
  const rows = [
    createRow('exchange', 'completed', {
      name: '가상교류과목',
      subjectCode: null,
      courseId: null,
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);
  assert.deepEqual(result.reviewPendingRowIds, ['exchange']);

  assert.equal(
    result.reviewIssues[0].reason,
    'IDENTITY_UNCERTAIN'
  );
});

test('A single in-progress record is identified correctly', () => {
  const rows = [
    createRow('current', 'in_progress', {
      termId: '2026-2',
    }),
  ];

  const result = analyzeCourseHistory(rows);

  assert.deepEqual(result.completedCandidates, []);
  assert.deepEqual(result.inProgressCandidates, ['current']);
});

test('History analysis does not modify the original records', () => {
  const rows = [
    createRow('first', 'completed'),
  ];

  const original = JSON.stringify(rows);

  analyzeCourseHistory(rows);

  assert.equal(JSON.stringify(rows), original);
});