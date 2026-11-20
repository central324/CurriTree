import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requestAiMatches,
} from '../public/klas/ai-request.js';

const params = {
  curriculumId: 'ce-2023',
  unmatchedCourses: [
    {
      clientId: 'local-001',
      name: '기계학습개론',
    },
  ],
};

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('Successful AI requests send only matching fields', async () => {
  const expected = {
    schemaVersion: 1,
    results: [
      {
        clientId: 'local-001',
        status: 'suggested',
        candidates: [],
      },
    ],
  };

  const result = await requestAiMatches({
    ...params,

    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/ai/match-courses');
      assert.equal(options.method, 'POST');

      assert.equal(
        options.headers['Content-Type'],
        'application/json'
      );

      assert.deepEqual(JSON.parse(options.body), {
        schemaVersion: 1,
        ...params,
      });

      return makeResponse(200, expected);
    },
  });

  assert.deepEqual(result, expected);
});

test('HTTP 429 displays a rate-limit message', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,
      fetchImpl: async () => makeResponse(429),
    }),
    /요청 횟수를 초과.*직접 선택/
  );
});

test('HTTP 503 explains AI unavailability', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,
      fetchImpl: async () => makeResponse(503),
    }),
    /AI 서비스를 사용할 수 없습니다.*직접 선택/
  );
});

test('HTTP 400 and 404 use safe request messages', async () => {
  for (const status of [400, 404]) {
    await assert.rejects(
      requestAiMatches({
        ...params,
        fetchImpl: async () => makeResponse(status),
      }),
      /요청 정보를 확인.*직접 선택/
    );
  }
});

test('HTTP 500 returns a generic error message', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,
      fetchImpl: async () => makeResponse(500),
    }),
    /요청에 실패.*직접 선택/
  );
});

test('Network errors display a user-friendly message', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,

      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    }),

    (error) => {
      assert.match(
        error.message,
        /네트워크 상태.*직접 선택/
      );

      assert.doesNotMatch(
        error.message,
        /Failed to fetch/
      );

      return true;
    }
  );
});

test('Invalid JSON responses are handled safely', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,

      fetchImpl: async () => ({
        ok: true,
        status: 200,

        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    }),

    /AI 응답을 읽지 못했습니다.*직접 선택/
  );
});

test('Invalid AI response structures are rejected', async () => {
  await assert.rejects(
    requestAiMatches({
      ...params,

      fetchImpl: async () =>
        makeResponse(200, {
          results: 'invalid',
        }),
    }),

    /AI 응답 형식이 올바르지 않습니다.*직접 선택/
  );
});
