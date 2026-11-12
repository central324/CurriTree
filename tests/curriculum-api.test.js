// 학과·교육과정 조회 API (docs/CONTRACT_CHECKLIST.md 5.4, 5.5, 9.5)
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../server/app.js';
import { loadRealCurriculum, makeCurriculum, makeCurriculumDir } from './helpers/curriculum.js';

const silent = { error() {} };

async function startServer(app) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

async function getJson(url) {
  const response = await fetch(url);
  return { status: response.status, type: response.headers.get('content-type'), body: await response.json() };
}

function assertError(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.body.schemaVersion, 1);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, 'string');
}

describe('실제 데이터로 실행한 서버', () => {
  let server;
  before(async () => {
    server = await startServer(createApp({ logger: silent }));
  });
  after(() => server.close());

  test('GET /api/departments는 학과별 curricula 목록을 반환한다', async () => {
    const result = await getJson(`${server.url}/api/departments`);
    assert.equal(result.status, 200);
    assert.match(result.type, /application\/json/);
    assert.deepEqual(result.body, {
      schemaVersion: 1,
      departments: [
        {
          id: 'ce',
          name: '컴퓨터정보공학부',
          defaultCurriculumId: 'ce-2023',
          curricula: [{ id: 'ce-2023', catalogYear: 2023, admissionYears: [2023], isDemo: false }],
        },
      ],
    });
  });

  test('GET /api/curriculum/ce는 기본 교육과정 JSON을 그대로 반환한다', async () => {
    const result = await getJson(`${server.url}/api/curriculum/ce`);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, loadRealCurriculum());
  });

  test('curriculumId를 지정해도 같은 교육과정을 반환한다', async () => {
    const result = await getJson(`${server.url}/api/curriculum/ce?curriculumId=ce-2023`);
    assert.equal(result.status, 200);
    assert.equal(result.body.curriculumId, 'ce-2023');
  });

  test('형식이 잘못된 학과 ID는 400 / INVALID_REQUEST', async () => {
    for (const dept of ['CE', '1ce', 'c_e']) {
      assertError(await getJson(`${server.url}/api/curriculum/${dept}`), 400, 'INVALID_REQUEST');
    }
  });

  test('형식은 맞지만 없는 학과는 404 / DEPARTMENT_NOT_FOUND', async () => {
    assertError(await getJson(`${server.url}/api/curriculum/nope`), 404, 'DEPARTMENT_NOT_FOUND');
  });

  test('형식이 잘못된 curriculumId는 400 / INVALID_REQUEST', async () => {
    assertError(await getJson(`${server.url}/api/curriculum/ce?curriculumId=CE_2026`), 400, 'INVALID_REQUEST');
    assertError(await getJson(`${server.url}/api/curriculum/ce?curriculumId=a&curriculumId=b`), 400, 'INVALID_REQUEST');
  });

  test('등록되지 않은 교육과정은 404 / CURRICULUM_NOT_FOUND', async () => {
    assertError(await getJson(`${server.url}/api/curriculum/ce?curriculumId=ce-1999`), 404, 'CURRICULUM_NOT_FOUND');
  });
});

describe('학과가 여러 개인 서버', () => {
  let server;
  let fixture;
  before(async () => {
    fixture = makeCurriculumDir({
      'ce.json': makeCurriculum({ curriculumId: 'ce-2023', department: { id: 'ce', name: '컴정공' } }),
      'ee.json': makeCurriculum({ curriculumId: 'ee-2026', department: { id: 'ee', name: '전자공' } }),
    });
    server = await startServer(createApp({ curriculumDir: fixture.directory, logger: silent }));
  });
  after(async () => {
    await server.close();
    fixture.cleanup();
  });

  test('다른 학과에 속한 curriculumId는 404 / CURRICULUM_NOT_FOUND', async () => {
    assertError(await getJson(`${server.url}/api/curriculum/ce?curriculumId=ee-2026`), 404, 'CURRICULUM_NOT_FOUND');
  });

  test('학과 목록은 학과 ID 순으로 정렬된다', async () => {
    const result = await getJson(`${server.url}/api/departments`);
    assert.deepEqual(
      result.body.departments.map((department) => department.id),
      ['ce', 'ee'],
    );
  });
});

describe('교육과정 데이터가 손상된 서버', () => {
  let server;
  let fixture;
  before(async () => {
    fixture = makeCurriculumDir({ 'bad.json': '{ not json' });
    server = await startServer(createApp({ curriculumDir: fixture.directory, logger: silent }));
  });
  after(async () => {
    await server.close();
    fixture.cleanup();
  });

  test('조회 API는 500 / INTERNAL_ERROR, health는 정상', async () => {
    assertError(await getJson(`${server.url}/api/departments`), 500, 'INTERNAL_ERROR');
    assertError(await getJson(`${server.url}/api/curriculum/ce`), 500, 'INTERNAL_ERROR');
    assert.equal((await getJson(`${server.url}/api/health`)).status, 200);
  });

  test('학과 ID 형식 오류는 데이터 상태와 관계없이 400', async () => {
    assertError(await getJson(`${server.url}/api/curriculum/CE`), 400, 'INVALID_REQUEST');
  });
});
