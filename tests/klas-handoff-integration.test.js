import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { buildMakerPlan } from '../public/klas/plan.js';

import {
  getHandoffSafetyState,
  getHandoffConfirmationMessage,
  confirmHandoffWithUser,
} from '../public/klas/handoff-safety.js';

import {
  saveMakerHandoff,
  consumeMakerHandoff,
} from '../public/klas/handoff.js';

import {
  SAMPLE_KLAS_TEXT,
  SAMPLE_CURRENT_TERM,
} from '../public/klas/sample-data.js';

import { loadRealCurriculum } from './helpers/curriculum.js';

const curriculum = loadRealCurriculum();

const HANDOFF_KEY = 'curritree:maker-handoff:v1';

// 교육과정에 존재하지 않는 가상 전공 과목입니다.
const unmatchedRow = [
  'I020-4-9999-01',
  '가상미매칭전공과목',
  '컴퓨터정보공학부',
  '전선',
  '3',
  'A0',
  '',
  '',
  '',
].join('\t');

function withParsingError(text) {
  return [text, '잘못된 과목 행'].join('\n');
}

function withUnmatchedCourse(text) {
  return [
    text,
    '2026학년도 1학기',
    unmatchedRow,
  ].join('\n');
}

// 실제 KLAS 분석 화면과 동일한 데이터 처리 순서를 사용합니다.
function prepareHandoff(rawText) {
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

  const rows = parsed.courses.map(
    (course) =>
      matchedMap.get(course.clientRowId) ?? course
  );

  const { plan } = buildMakerPlan(rows, curriculum);

  const safety = getHandoffSafetyState({
    warnings: parsed.warnings,
    reviewPendingCount: plan.reviewPendingCount,
  });

  return { parsed, matched, plan, safety };
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

// 브라우저 전달 버튼의 승인·저장 순서를 모의합니다.
function attemptHandoff(storage, result, confirmFn) {
  const approved = confirmHandoffWithUser(
    result.safety,
    confirmFn
  );

  if (!approved) {
    return false;
  }

  saveMakerHandoff(storage, result.plan);

  return true;
}

test('정상 입력은 추가 확인 없이 전달된다', () => {
  const result = prepareHandoff(SAMPLE_KLAS_TEXT);
  const storage = createMemoryStorage();

  assert.equal(result.parsed.courses.length, 6);
  assert.equal(result.safety.parsingWarningCount, 0);
  assert.equal(result.safety.reviewPendingCount, 0);
  assert.equal(result.safety.isFullyReviewed, true);

  let confirmCalls = 0;

  const saved = attemptHandoff(
    storage,
    result,
    () => {
      confirmCalls += 1;
      return false;
    }
  );

  assert.equal(saved, true);
  assert.equal(confirmCalls, 0);

  const received = consumeMakerHandoff(storage);

  assert.deepEqual(received, result.plan);
  assert.equal(received.completedCourses.length, 3);
  assert.equal(received.inProgressCourses.length, 2);
  assert.equal(received.reviewPendingCount, 0);

  // 커리메이커 전달 데이터는 일회성입니다.
  assert.equal(consumeMakerHandoff(storage), null);
});

test('파싱 경고만 발생하면 확인이 필요하다', () => {
  const result = prepareHandoff(
    withParsingError(SAMPLE_KLAS_TEXT)
  );

  assert.equal(result.parsed.courses.length, 6);
  assert.equal(result.safety.parsingWarningCount, 1);
  assert.equal(result.safety.reviewPendingCount, 0);

  assert.equal(result.safety.requiresConfirmation, true);
  assert.equal(result.safety.isFullyReviewed, false);

  const message = getHandoffConfirmationMessage(
    result.safety
  );

  assert.match(message, /파싱 경고 1건/);
  assert.doesNotMatch(message, /수강 기록 확인 필요 0건/);
});

test('미매칭 전공 과목은 확인 필요 상태로 유지된다', () => {
  const result = prepareHandoff(
    withUnmatchedCourse(SAMPLE_KLAS_TEXT)
  );

  assert.equal(result.parsed.courses.length, 7);
  assert.equal(result.parsed.warnings.length, 0);

  assert.equal(result.safety.parsingWarningCount, 0);
  assert.equal(result.safety.reviewPendingCount, 1);
  assert.equal(result.safety.requiresConfirmation, true);

  assert.equal(result.plan.completedCourses.length, 3);
  assert.equal(result.plan.inProgressCourses.length, 2);

  const message = getHandoffConfirmationMessage(
    result.safety
  );

  assert.match(message, /수강 기록 확인 필요 1건/);
});

test('복합 경고는 하나의 확인 창으로 처리된다', () => {
  const rawText = withUnmatchedCourse(
    withParsingError(SAMPLE_KLAS_TEXT)
  );

  const result = prepareHandoff(rawText);

  assert.equal(result.parsed.courses.length, 7);
  assert.equal(result.safety.parsingWarningCount, 1);
  assert.equal(result.safety.reviewPendingCount, 1);

  let confirmCalls = 0;

  const saved = attemptHandoff(
    createMemoryStorage(),
    result,
    (message) => {
      confirmCalls += 1;

      assert.match(message, /파싱 경고 1건/);
      assert.match(message, /수강 기록 확인 필요 1건/);

      return true;
    }
  );

  assert.equal(saved, true);
  assert.equal(confirmCalls, 1);
});

test('사용자가 취소하면 기존 저장 데이터를 변경하지 않는다', () => {
  const result = prepareHandoff(
    withParsingError(SAMPLE_KLAS_TEXT)
  );

  const storage = createMemoryStorage();

  storage.setItem(HANDOFF_KEY, 'already-stored');

  const saved = attemptHandoff(
    storage,
    result,
    () => false
  );

  assert.equal(saved, false);
  assert.equal(
    storage.getItem(HANDOFF_KEY),
    'already-stored'
  );
});

test('승인 후 정상 과목만 기존 계약으로 전달된다', () => {
  const rawText = withUnmatchedCourse(
    withParsingError(SAMPLE_KLAS_TEXT)
  );

  const result = prepareHandoff(rawText);
  const storage = createMemoryStorage();

  assert.equal(
    attemptHandoff(storage, result, () => true),
    true
  );

  const received = consumeMakerHandoff(storage);

  assert.equal(received.schemaVersion, 1);
  assert.equal(received.curriculumId, 'ce-2023');

  // 정상 인식된 전공·교양 기록은 유지합니다.
  assert.equal(received.completedCourses.length, 3);
  assert.equal(received.inProgressCourses.length, 2);
  assert.equal(
    received.otherEarnedCredits.general_elective,
    3
  );

  // 파싱 경고는 계약에 추가하지 않고, 미확정 기록은 유지합니다.
  assert.equal(received.reviewPendingCount, 1);
  assert.equal(received.parsingWarningCount, undefined);

  const serialized = JSON.stringify(received);

  assert.equal(serialized.includes('rawText'), false);
  assert.equal(serialized.includes('grade'), false);
  assert.equal(serialized.includes('I020-4-9999'), false);
  assert.equal(serialized.includes('가상미매칭전공과목'), false);
  assert.equal(serialized.includes('잘못된 과목 행'), false);
});

test('여러 파싱 오류를 수정하면 확인 절차가 사라진다', () => {
  const invalidText = [
    SAMPLE_KLAS_TEXT,
    '잘못된 과목 행',
    '두 번째 잘못된 행',
  ].join('\n');

  const before = prepareHandoff(invalidText);

  assert.equal(before.safety.parsingWarningCount, 2);
  assert.equal(before.safety.requiresConfirmation, true);

  // 잘못된 입력 행을 제거하고 다시 분석합니다.
  const after = prepareHandoff(SAMPLE_KLAS_TEXT);

  assert.equal(after.safety.parsingWarningCount, 0);
  assert.equal(after.safety.reviewPendingCount, 0);
  assert.equal(after.safety.requiresConfirmation, false);
  assert.equal(after.safety.isFullyReviewed, true);
});

test('KLAS 화면의 저장·복사 버튼 모두 확인 절차를 사용한다', () => {
  const script = readFileSync(
    new URL('../public/klas/klas.js', import.meta.url),
    'utf8'
  );

  assert.match(script, /getHandoffSafetyState/);
  assert.match(script, /safety\.isFullyReviewed/);

  const calls = script.match(
    /confirmHandoffWithUser\(/g
  ) ?? [];

  // JSON 복사와 커리메이커 반영하기에 각각 한 번씩 연결됩니다.
  assert.equal(calls.length, 2);
});
