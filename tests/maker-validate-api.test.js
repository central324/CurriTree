import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";

import { createApp } from "../server/app.js";
import { createEmptyPlan } from "../shared/maker/plan.js";

let server;
let baseUrl;

// 테스트 전용 서버 실행
before(async () => {
  const app = createApp();

  server = app.listen(0, "127.0.0.1");

  await once(server, "listening");

  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

// 테스트가 끝나면 서버 종료
after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});

// 수강 계획을 검증 API에 전송하는 함수
function sendPlan(plan) {
  return fetch(`${baseUrl}/api/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(plan),
  });
}

// 1. 정상적인 수강 계획 요청
test("POST /api/validate 정상 요청 HTTP 200", async () => {
  const plan = createEmptyPlan("ce-2023");

  const response = await sendPlan(plan);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.schemaVersion, 1);

  assert.ok(
    ["met", "unmet", "unknown"].includes(result.overallStatus)
  );

  assert.ok(result.summary);
  assert.ok(result.checks);
  assert.ok(Array.isArray(result.warnings));
});

// 2. 필수 필드가 누락된 경우
test("필수 필드 누락 시 HTTP 400", async () => {
  const plan = createEmptyPlan("ce-2023");

  delete plan.plannedTerms;

  const response = await sendPlan(plan);
  const result = await response.json();

  assert.equal(response.status, 400);
  assert.equal(result.error.code, "INVALID_REQUEST");

  assert.ok(
    result.error.details.some(
      item => item.field === "plannedTerms"
    )
  );
});

// 3. JSON 형식이 잘못된 경우
test("잘못된 JSON 요청 시 HTTP 400", async () => {
  const response = await fetch(`${baseUrl}/api/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: '{"schemaVersion":',
  });

  const result = await response.json();

  assert.equal(response.status, 400);
  assert.equal(result.error.code, "INVALID_REQUEST");
});

// 4. 존재하지 않는 교육과정
test("교육과정이 없으면 HTTP 404", async () => {
  const plan = createEmptyPlan("ce-9999");

  const response = await sendPlan(plan);
  const result = await response.json();

  assert.equal(response.status, 404);
  assert.equal(result.error.code, "CURRICULUM_NOT_FOUND");
});

// 5. 동일 과목을 두 학기에 중복 등록
test("중복 과목 배치 시 HTTP 422", async () => {
  // 실제 교육과정에서 과목 하나 가져오기
  const curriculumResponse = await fetch(
    `${baseUrl}/api/curriculum/ce?curriculumId=ce-2023`
  );

  assert.equal(curriculumResponse.status, 200);

  const curriculum = await curriculumResponse.json();
  const courseId = curriculum.courses[0].id;

  const plan = createEmptyPlan("ce-2023");

  plan.plannedTerms = [
    {
      termId: "2027-1",
      courseIds: [courseId],
    },
    {
      termId: "2027-2",
      courseIds: [courseId],
    },
  ];

  const response = await sendPlan(plan);
  const result = await response.json();

  assert.equal(response.status, 422);
  assert.equal(result.error.code, "INVALID_PLAN");
  assert.ok(result.error.details.length > 0);
});
