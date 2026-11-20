import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { requestAiMatches } from '../public/klas/ai-request.js';
import { buildMakerPlan } from '../public/klas/plan.js';
import {
  saveMakerHandoff,
  consumeMakerHandoff,
} from '../public/klas/handoff.js';
import { loadRealCurriculum } from './helpers/curriculum.js';

function createKlasRow(code, name, category, credits, grade) {
  return [
    code,
    name,
    '컴퓨터정보공학부',
    category,
    String(credits),
    grade,
    '',
    '',
    '',
  ].join('\t');
}

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

test('AI 실패 후 수동 확정한 과목을 커리메이커로 전달할 수 있다', async () => {
  const curriculum = loadRealCurriculum();

  const rawText = [
    '2026학년도 1학기',
    createKlasRow(
      'I020-2-3703-01',
      '데이터구조설계',
      '전필',
      3,
      'A+'
    ),
    createKlasRow(
      'I020-4-9999-01',
      '기계학습개론',
      '전선',
      3,
      'A0'
    ),
    '2026학년도 2학기',
    createKlasRow(
      'I020-2-0454-01',
      '디지털논리회로2',
      '전필',
      3,
      ''
    ),
  ].join('\n');

  // 1. 가상 KLAS 성적조회 데이터를 분석합니다.
  const parsed = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  assert.equal(parsed.courses.length, 3);
  assert.equal(parsed.warnings.length, 0);

  // 2. 실제 교육과정 데이터를 이용해 과목을 매칭합니다.
  const matched = matchParsedCourses(
    parsed.courses,
    curriculum
  );

  assert.equal(matched.courses[0].match.status, 'exact');
  assert.equal(matched.courses[1].match.status, 'unmatched');
  assert.equal(matched.courses[2].match.status, 'exact');

  const beforeConfirmation = buildMakerPlan(
    matched.courses,
    curriculum
  );

  assert.equal(beforeConfirmation.plan.reviewPendingCount, 1);
  assert.equal(beforeConfirmation.plan.completedCourses.length, 1);
  assert.equal(beforeConfirmation.plan.inProgressCourses.length, 1);

  // 3. 실제 API를 호출하지 않고 Gemini 장애를 재현합니다.
  await assert.rejects(
    requestAiMatches({
      curriculumId: curriculum.curriculumId,
      unmatchedCourses: [
        {
          clientId: matched.courses[1].clientRowId,
          name: '기계학습개론',
        },
      ],
      fetchImpl: async () => ({
        ok: false,
        status: 503,
      }),
    }),
    /AI 서비스를 사용할 수 없습니다/
  );

  // 4. AI 장애 이후 사용자가 머신러닝 과목을 직접 확정합니다.
  const confirmedRows = matched.courses.map((row) => {
    if (row.name !== '기계학습개론') {
      return row;
    }

    return {
      ...row,
      match: {
        status: 'confirmed',
        courseId: 'machine-learning',
      },
    };
  });

  const { plan } = buildMakerPlan(
    confirmedRows,
    curriculum
  );

  assert.equal(plan.reviewPendingCount, 0);
  assert.equal(plan.completedCourses.length, 2);
  assert.equal(plan.inProgressCourses.length, 1);

  assert.ok(
    plan.completedCourses.some(
      (course) => course.courseId === 'machine-learning'
    )
  );

  // 5. 커리메이커 전달 데이터를 저장하고 다시 가져옵니다.
  const storage = createMemoryStorage();

  saveMakerHandoff(storage, plan);

  const received = consumeMakerHandoff(storage);

  assert.deepEqual(received, plan);

  // 전달 데이터는 한 번만 사용할 수 있어야 합니다.
  assert.equal(consumeMakerHandoff(storage), null);

  // 원본 과목명, 학정번호, 성적은 전달하지 않습니다.
  const serialized = JSON.stringify(received);

  assert.equal(serialized.includes('기계학습개론'), false);
  assert.equal(serialized.includes('I020-4-9999'), false);
  assert.equal(serialized.includes('A+'), false);
  assert.equal(serialized.includes('rawText'), false);
});
