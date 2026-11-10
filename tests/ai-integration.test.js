import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../server/app.js';

// 테스트용 서버를 임시 포트에서 실행합니다.
async function startServer() {
  const app = createApp({
    logger: {
      error() {},
    },
  });

  const server = app.listen(0);

  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

// 테스트 종료 후 서버를 안전하게 종료합니다.
async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

test('실제 서버에 Gemini 과목 매칭 API가 등록되어 있다', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/ai/match-courses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          curriculumId: 'ce-not-exist',
          unmatchedCourses: [
            {
              clientId: 'local-001',
              name: '기계학습개론',
            },
          ],
        }),
      }
    );

    const result = await response.json();

    // API가 실제 서버에 연결되어 있어야 합니다.
    // 존재하지 않는 교육과정을 요청했으므로 404를 반환합니다.
    assert.equal(response.status, 404);

    assert.equal(
      result.error.code,
      'CURRICULUM_NOT_FOUND'
    );
  } finally {
    await closeServer(server);
  }
});

test('실제 교육과정에서 매칭 대상이 없으면 정상 응답을 반환한다', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(
      `${baseUrl}/api/ai/match-courses`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          schemaVersion: 1,
          curriculumId: 'ce-2026',
          unmatchedCourses: [],
        }),
      }
    );

    assert.equal(response.status, 200);

    const result = await response.json();

    assert.deepEqual(result, {
      schemaVersion: 1,
      results: [],
    });
  } finally {
    await closeServer(server);
  }
});