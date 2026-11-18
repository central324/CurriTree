import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { createApp } from '../server/app.js';

test('AI API 요청 제한 및 일반 API 정상 동작', async () => {
  const app = createApp({
    logger: { error() {} },
  });

  const server = app.listen(0);
  await once(server, 'listening');

  const baseUrl =
    `http://127.0.0.1:${server.address().port}`;

  const requestAi = () =>
    fetch(`${baseUrl}/api/ai/match-courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schemaVersion: 1,
        curriculumId: 'not-real',
        unmatchedCourses: [
          {
            clientId: 'local-001',
            name: '테스트과목',
          },
        ],
      }),
    });

  try {
    // 존재하지 않는 교육과정이므로 정상적인 요청은 404
    for (let i = 0; i < 10; i++) {
      const response = await requestAi();
      assert.equal(response.status, 404);
    }

    // 11번째 요청부터 제한 적용
    const limitedResponse = await requestAi();
    assert.equal(limitedResponse.status, 429);

    const result = await limitedResponse.json();
    assert.equal(result.error.code, 'RATE_LIMITED');

    assert.ok(limitedResponse.headers.get('retry-after'));

    // 일반 API는 요청 제한의 영향을 받지 않음
    const healthResponse =
      await fetch(`${baseUrl}/api/health`);

    assert.equal(healthResponse.status, 200);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
