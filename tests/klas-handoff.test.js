import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeMakerPlan,
  saveMakerHandoff,
  consumeMakerHandoff,
} from '../public/klas/handoff.js';

function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key)
        ? values.get(key)
        : null;
    },

    setItem(key, value) {
      values.set(key, String(value));
    },

    removeItem(key) {
      values.delete(key);
    },

    getStoredValues() {
      return [...values.values()];
    },
  };
}

function createPlan() {
  return {
    schemaVersion: 1,
    curriculumId: 'ce-2026',

    completedCourses: [
      {
        courseId: 'data-structure-design',
        termId: '2026-1',
        earnedCredits: 3,
      },
    ],

    inProgressCourses: [
      {
        courseId: 'algorithms',
        termId: '2026-2',
      },
    ],

    otherEarnedCredits: {
      general_required: 3,
      general_elective: 6,
      foundation_required: 0,
      foundation_elective: 0,
      free_elective: 0,
    },

    plannedTerms: [],

    reviewPendingCount: 1,
  };
}

test('Maker handoff preserves the plan contract', () => {
  const plan = createPlan();

  const result = sanitizeMakerPlan(plan);

  assert.deepEqual(result, plan);
});

test('Maker handoff preserves the curriculum ID', () => {
  const plan = createPlan();
  plan.curriculumId = 'ce-2023';

  const result = sanitizeMakerPlan(plan);

  assert.equal(result.curriculumId, 'ce-2023');
});

test('Maker handoff excludes unexpected personal fields', () => {
  const plan = createPlan();

  plan.studentId = 'PRIVATE_STUDENT_ID';
  plan.rawText = 'PRIVATE_KLAS_TEXT';

  plan.completedCourses[0].rawGrade = 'A+';

  const result = sanitizeMakerPlan(plan);
  const serialized = JSON.stringify(result);

  assert.equal(
    serialized.includes('PRIVATE_STUDENT_ID'),
    false
  );

  assert.equal(
    serialized.includes('PRIVATE_KLAS_TEXT'),
    false
  );

  assert.equal(
    serialized.includes('rawGrade'),
    false
  );
});

test('Maker handoff can be saved and consumed once', () => {
  const storage = createMemoryStorage();
  const plan = createPlan();

  saveMakerHandoff(storage, plan);

  const received = consumeMakerHandoff(storage);

  assert.deepEqual(received, plan);

  assert.equal(
    consumeMakerHandoff(storage),
    null
  );
});

test('Invalid handoff data is rejected', () => {
  const plan = createPlan();

  plan.completedCourses[0].earnedCredits = -3;

  assert.throws(
    () => sanitizeMakerPlan(plan),
    TypeError
  );
});

test('Malformed stored data is safely discarded', () => {
  const storage = createMemoryStorage();

  storage.setItem(
    'curritree:maker-handoff:v1',
    '{invalid-json'
  );

  const result = consumeMakerHandoff(storage);

  assert.equal(result, null);
  assert.deepEqual(storage.getStoredValues(), []);
});
