import test from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestCourseMatches,
  LlmUnavailableError,
} from '../server/services/geminiMatcher.js';

const curriculum = {
  curriculumId: 'demo-curriculum',
  courses: [
    {
      id: 'demo-ds',
      name: '자료구조',
      aliases: ['데이터구조설계'],
    },
    {
      id: 'demo-ml',
      name: '머신러닝',
      aliases: ['기계학습'],
    },
  ],
};

const unmatchedCourses = [
  {
    clientId: 'local-001',
    name: '기계학습개론',
  },
];

function createMockResponse(modelOutput, ok = true) {
  return {
    ok,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify(modelOutput),
              },
            ],
          },
        },
      ],
    }),
  };
}

test('Valid LLM suggestions are returned correctly', async () => {
  const fetchImpl = async () =>
    createMockResponse({
      results: [
        {
          clientId: 'local-001',
          status: 'suggested',
          candidates: [
            {
              courseId: 'demo-ml',
              confidence: 'medium',
              reason: '과목명이 유사합니다.',
            },
          ],
        },
      ],
    });

  const result = await suggestCourseMatches({
    unmatchedCourses,
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.results[0].status, 'suggested');

  assert.equal(
    result.results[0].candidates[0].courseId,
    'demo-ml'
  );
});

test('Nonexistent course IDs are rejected', async () => {
  const fetchImpl = async () =>
    createMockResponse({
      results: [
        {
          clientId: 'local-001',
          status: 'suggested',
          candidates: [
            {
              courseId: 'invented-course',
              confidence: 'high',
              reason: '추천 후보입니다.',
            },
          ],
        },
      ],
    });

  const result = await suggestCourseMatches({
    unmatchedCourses,
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(result.results[0].status, 'unmatched');
  assert.deepEqual(result.results[0].candidates, []);
});

test('Missing model results become unmatched', async () => {
  const fetchImpl = async () =>
    createMockResponse({
      results: [],
    });

  const result = await suggestCourseMatches({
    unmatchedCourses,
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(result.results[0].status, 'unmatched');
});

test('An API key is required for an actual request', async () => {
  await assert.rejects(
    suggestCourseMatches({
      unmatchedCourses,
      curriculum,
      apiKey: '',
    }),
    LlmUnavailableError
  );
});

test('Gemini HTTP failures are handled safely', async () => {
  const fetchImpl = async () => ({
    ok: false,
  });

  await assert.rejects(
    suggestCourseMatches({
      unmatchedCourses,
      curriculum,
      apiKey: 'test-key',
      fetchImpl,
    }),
    LlmUnavailableError
  );
});

test('Malformed Gemini responses are rejected', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'not-valid-json',
              },
            ],
          },
        },
      ],
    }),
  });

  await assert.rejects(
    suggestCourseMatches({
      unmatchedCourses,
      curriculum,
      apiKey: 'test-key',
      fetchImpl,
    }),
    LlmUnavailableError
  );
});

test('Raw grades and personal fields are not sent to Gemini', async () => {
  let submittedBody = '';

  const fetchImpl = async (_url, options) => {
    submittedBody = options.body;

    return createMockResponse({
      results: [],
    });
  };

  await suggestCourseMatches({
    unmatchedCourses: [
      {
        clientId: 'local-001',
        name: '기계학습개론',
        grade: 'A+',
        studentId: 'PRIVATE_STUDENT_ID',
        rawText: 'PRIVATE_RAW_TEXT',
      },
    ],
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
  });

  assert.equal(submittedBody.includes('A+'), false);
  assert.equal(
    submittedBody.includes('PRIVATE_STUDENT_ID'),
    false
  );
  assert.equal(
    submittedBody.includes('PRIVATE_RAW_TEXT'),
    false
  );
});

test('Empty course lists do not call Gemini', async () => {
  let called = false;

  const fetchImpl = async () => {
    called = true;
  };

  const result = await suggestCourseMatches({
    unmatchedCourses: [],
    curriculum,
    apiKey: '',
    fetchImpl,
  });

  assert.equal(called, false);
  assert.deepEqual(result.results, []);
});

test('Gemini retries HTTP 503 and succeeds', async () => {
  let attempts = 0;
  const delays = [];

  const fetchImpl = async () => {
    attempts += 1;

    if (attempts === 1) {
      return {
        ok: false,
        status: 503,
      };
    }

    return createMockResponse({
      results: [
        {
          clientId: 'local-001',
          status: 'suggested',
          candidates: [
            {
              courseId: 'demo-ml',
              confidence: 'high',
              reason: '과목명이 유사합니다.',
            },
          ],
        },
      ],
    });
  };

  const result = await suggestCourseMatches({
    unmatchedCourses,
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
    waitImpl: async (ms) => {
      delays.push(ms);
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1000]);

  assert.equal(
    result.results[0].candidates[0].courseId,
    'demo-ml'
  );
});

test('Gemini stops retrying after repeated HTTP 503 errors', async () => {
  let attempts = 0;
  const delays = [];

  const fetchImpl = async () => {
    attempts += 1;

    return {
      ok: false,
      status: 503,
    };
  };

  await assert.rejects(
    suggestCourseMatches({
      unmatchedCourses,
      curriculum,
      apiKey: 'test-key',
      fetchImpl,
      waitImpl: async (ms) => {
        delays.push(ms);
      },
    }),
    LlmUnavailableError
  );

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('Gemini does not retry HTTP 400 errors', async () => {
  let attempts = 0;

  const fetchImpl = async () => {
    attempts += 1;

    return {
      ok: false,
      status: 400,
    };
  };

  await assert.rejects(
    suggestCourseMatches({
      unmatchedCourses,
      curriculum,
      apiKey: 'test-key',
      fetchImpl,
      waitImpl: async () => {},
    }),
    LlmUnavailableError
  );

  assert.equal(attempts, 1);
});

test('Gemini retries HTTP 429 errors', async () => {
  let attempts = 0;

  const fetchImpl = async () => {
    attempts += 1;

    if (attempts === 1) {
      return {
        ok: false,
        status: 429,
      };
    }

    return createMockResponse({
      results: [],
    });
  };

  const result = await suggestCourseMatches({
    unmatchedCourses,
    curriculum,
    apiKey: 'test-key',
    fetchImpl,
    waitImpl: async () => {},
  });

  assert.equal(attempts, 2);
  assert.equal(result.results[0].status, 'unmatched');
});