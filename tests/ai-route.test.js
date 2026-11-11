import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import {
  createAiMatchRouter,
} from '../server/routes/ai.js';

import {
  LlmUnavailableError,
} from '../server/services/geminiMatcher.js';

const curriculum = {
  schemaVersion: 1,
  curriculumId: 'ce-demo-2026',
  courses: [
    {
      id: 'demo-ml',
      name: '머신러닝',
      aliases: ['기계학습'],
    },
  ],
};

const validRequest = {
  schemaVersion: 1,
  curriculumId: 'ce-demo-2026',
  unmatchedCourses: [
    {
      clientId: 'local-001',
      name: '기계학습개론',
    },
  ],
};

const defaultFindCurriculum = async (curriculumId) =>
  curriculumId === curriculum.curriculumId
    ? curriculum
    : null;

const defaultMatchCourses = async () => ({
  schemaVersion: 1,
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

async function requestMatchingApi(
  body,
  {
    findCurriculum = defaultFindCurriculum,
    matchCourses = defaultMatchCourses,
  } = {}
) {
  const app = express();

  app.use(express.json());

  app.use(
    '/api/ai',
    createAiMatchRouter({
      findCurriculum,
      matchCourses,
    })
  );

  const server = app.listen(0);

  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  const baseUrl =
    `http://127.0.0.1:${server.address().port}`;

  try {
    const response = await fetch(
      `${baseUrl}/api/ai/match-courses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    return {
      status: response.status,
      body: await response.json(),
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('Matching API returns HTTP 200 for valid requests', async () => {
  const response = await requestMatchingApi(validRequest);

  assert.equal(response.status, 200);
  assert.equal(response.body.schemaVersion, 1);

  assert.equal(
    response.body.results[0].candidates[0].courseId,
    'demo-ml'
  );
});

test('Missing required fields return HTTP 400', async () => {
  const response = await requestMatchingApi({
    schemaVersion: 1,
    curriculumId: 'ce-demo-2026',
  });

  assert.equal(response.status, 400);

  assert.equal(
    response.body.error.code,
    'INVALID_REQUEST'
  );
});

test('Personal information fields are rejected', async () => {
  const response = await requestMatchingApi({
    schemaVersion: 1,
    curriculumId: 'ce-demo-2026',
    unmatchedCourses: [
      {
        clientId: 'local-001',
        name: '가상과목',
        grade: 'A+',
        studentId: 'PRIVATE_ID',
      },
    ],
  });

  assert.equal(response.status, 400);

  assert.equal(
    response.body.error.code,
    'INVALID_REQUEST'
  );

  assert.equal(
    JSON.stringify(response.body).includes('PRIVATE_ID'),
    false
  );
});

test('Invalid curriculum IDs return HTTP 400', async () => {
  const response = await requestMatchingApi({
    ...validRequest,
    curriculumId: 'INVALID ID!',
  });

  assert.equal(response.status, 400);
});

test('Unknown curricula return HTTP 404', async () => {
  const response = await requestMatchingApi({
    ...validRequest,
    curriculumId: 'unknown-curriculum',
  });

  assert.equal(response.status, 404);

  assert.equal(
    response.body.error.code,
    'CURRICULUM_NOT_FOUND'
  );
});

test('Gemini failures return HTTP 503', async () => {
  const response = await requestMatchingApi(
    validRequest,
    {
      matchCourses: async () => {
        throw new LlmUnavailableError();
      },
    }
  );

  assert.equal(response.status, 503);

  assert.equal(
    response.body.error.code,
    'AI_UNAVAILABLE'
  );
});

test('Unexpected server errors return HTTP 500', async () => {
  const response = await requestMatchingApi(
    validRequest,
    {
      findCurriculum: async () => {
        throw new Error('Internal test error');
      },
    }
  );

  assert.equal(response.status, 500);

  assert.equal(
    response.body.error.code,
    'INTERNAL_ERROR'
  );
});

test('Duplicate client IDs return HTTP 400', async () => {
  const response = await requestMatchingApi({
    schemaVersion: 1,
    curriculumId: 'ce-demo-2026',
    unmatchedCourses: [
      {
        clientId: 'local-001',
        name: '가상과목A',
      },
      {
        clientId: 'local-001',
        name: '가상과목B',
      },
    ],
  });

  assert.equal(response.status, 400);
});