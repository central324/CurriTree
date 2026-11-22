import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import {
  SAMPLE_CURRENT_TERM,
  SAMPLE_KLAS_TEXT,
} from '../public/klas/sample-data.js';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { buildMakerPlan } from '../public/klas/plan.js';
import {
  saveMakerHandoff,
  consumeMakerHandoff,
} from '../public/klas/handoff.js';

import { loadRealCurriculum } from './helpers/curriculum.js';
import { createApp } from '../server/app.js';

const curriculum = loadRealCurriculum();

// 브라우저의 KLAS 분석 흐름과 동일한 순서로 처리합니다.
function analyzeKlasInput(rawText = SAMPLE_KLAS_TEXT) {
  const parsed = parseKlasText(rawText, {
    currentTermId: SAMPLE_CURRENT_TERM,
  });

  const majorRows = parsed.courses.filter(
    (course) =>
      course.category === 'major_required' ||
      course.category === 'major_elective'
  );

  const matched = matchParsedCourses(
    majorRows,
    curriculum
  );

  const matchedMap = new Map(
    matched.courses.map((course) => [
      course.clientRowId,
      course,
    ])
  );

  // 전공 매칭 결과와 교양 과목을 함께 유지합니다.
  const rows = parsed.courses.map(
    (course) =>
      matchedMap.get(course.clientRowId) ?? course
  );

  const { plan } = buildMakerPlan(rows, curriculum);

  return { parsed, matched, plan };
}

// 브라우저 sessionStorage 동작을 모의합니다.
function createMemoryStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },

    setItem(key, value) {
      values.set(key, String(value));
    },

    removeItem(key) {
      values.delete(key);
    },
  };
}

test('예시 데이터가 커리메이커 전달까지 정상 처리된다', () => {
  const { parsed, matched, plan } = analyzeKlasInput();

  // 1. 예시 데이터 분석
  assert.equal(parsed.courses.length, 6);
  assert.equal(parsed.warnings.length, 0);

  // 2. 전공 과목 자동 매칭
  assert.equal(matched.courses.length, 5);
  assert.equal(matched.reviewIssues.length, 0);

  assert.ok(
    matched.courses.every(
      (course) => course.match.status === 'exact'
    )
  );

  // 3. 커리메이커 수강 계획 생성
  assert.equal(plan.curriculumId, 'ce-2023');
  assert.equal(plan.completedCourses.length, 3);
  assert.equal(plan.inProgressCourses.length, 2);
  assert.equal(plan.reviewPendingCount, 0);

  assert.equal(
    plan.otherEarnedCredits.general_elective,
    3
  );

  const earnedMajorCredits = plan.completedCourses.reduce(
    (total, course) => total + course.earnedCredits,
    0
  );

  assert.equal(earnedMajorCredits, 9);

  // 4. 일회성 데이터 전달
  const storage = createMemoryStorage();

  saveMakerHandoff(storage, plan);

  const received = consumeMakerHandoff(storage);

  assert.deepEqual(received, plan);
  assert.equal(consumeMakerHandoff(storage), null);

  // 5. 전달 데이터의 개인정보 및 원문 제외
  const serialized = JSON.stringify(received);

  assert.equal(serialized.includes('rawText'), false);
  assert.equal(serialized.includes('grade'), false);
  assert.equal(serialized.includes('학정번호'), false);
  assert.equal(serialized.includes('디지털논리회로1'), false);
});

test('잘못된 과목 행이 있어도 정상 과목은 유지된다', () => {
  const rawText = [
    SAMPLE_KLAS_TEXT,
    '잘못된 과목 행',
  ].join('\n');

  const { parsed, matched, plan } = analyzeKlasInput(
    rawText
  );

  assert.equal(parsed.courses.length, 6);
  assert.equal(parsed.warnings.length, 1);

  assert.equal(
    parsed.warnings[0].reason,
    'ROW_FORMAT_INVALID'
  );

  // 오류가 있는 줄만 제외하고 기존 과목은 유지됩니다.
  assert.equal(matched.courses.length, 5);
  assert.equal(plan.completedCourses.length, 3);
  assert.equal(plan.inProgressCourses.length, 2);
  assert.equal(plan.reviewPendingCount, 0);
});

test('예시 수강 계획이 실제 검증 API를 통과한다', async () => {
  const { plan } = analyzeKlasInput();

  // 별도 포트에서 테스트 서버를 실행합니다.
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');

  try {
    await once(server, 'listening');

    const port = server.address().port;

    const response = await fetch(
      `http://127.0.0.1:${port}/api/validate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plan),
      }
    );

    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.schemaVersion, 1);
    assert.ok(result.summary);

    assert.ok(
      ['met', 'unmet', 'unknown'].includes(
        result.overallStatus
      )
    );
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
