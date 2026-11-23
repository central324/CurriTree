import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getHandoffSafetyState,
} from '../public/klas/handoff-safety.js';

import { parseKlasText } from '../public/klas/parser.js';

import {
  SAMPLE_KLAS_TEXT,
  SAMPLE_CURRENT_TERM,
} from '../public/klas/sample-data.js';

function createWarning(lineNumber) {
  return {
    lineNumber,
    reason: 'ROW_FORMAT_INVALID',
  };
}

test('경고가 없으면 추가 확인 없이 전달할 수 있다', () => {
  const state = getHandoffSafetyState({
    warnings: [],
    reviewPendingCount: 0,
  });

  assert.equal(state.parsingWarningCount, 0);
  assert.equal(state.reviewPendingCount, 0);

  assert.equal(state.hasParsingWarnings, false);
  assert.equal(state.hasReviewPending, false);

  assert.equal(state.requiresConfirmation, false);
  assert.equal(state.isFullyReviewed, true);
});

test('파싱 경고만 있으면 사용자 확인이 필요하다', () => {
  const state = getHandoffSafetyState({
    warnings: [createWarning(3)],
    reviewPendingCount: 0,
  });

  assert.equal(state.parsingWarningCount, 1);
  assert.equal(state.reviewPendingCount, 0);

  assert.equal(state.hasParsingWarnings, true);
  assert.equal(state.hasReviewPending, false);

  assert.equal(state.requiresConfirmation, true);
  assert.equal(state.isFullyReviewed, false);
});

test('미확정 수강 기록만 있어도 사용자 확인이 필요하다', () => {
  const state = getHandoffSafetyState({
    warnings: [],
    reviewPendingCount: 1,
  });

  assert.equal(state.parsingWarningCount, 0);
  assert.equal(state.reviewPendingCount, 1);

  assert.equal(state.hasParsingWarnings, false);
  assert.equal(state.hasReviewPending, true);

  assert.equal(state.requiresConfirmation, true);
  assert.equal(state.isFullyReviewed, false);
});

test('두 종류의 경고가 동시에 발생해도 구분한다', () => {
  const state = getHandoffSafetyState({
    warnings: [createWarning(3)],
    reviewPendingCount: 2,
  });

  assert.equal(state.parsingWarningCount, 1);
  assert.equal(state.reviewPendingCount, 2);

  assert.equal(state.hasParsingWarnings, true);
  assert.equal(state.hasReviewPending, true);

  assert.equal(state.requiresConfirmation, true);
  assert.equal(state.isFullyReviewed, false);
});

test('파싱 경고가 여러 건이어도 정확히 계산한다', () => {
  const warnings = [
    createWarning(3),
    createWarning(7),
    createWarning(12),
  ];

  const state = getHandoffSafetyState({
    warnings,
    reviewPendingCount: 0,
  });

  assert.equal(state.parsingWarningCount, 3);
  assert.equal(state.requiresConfirmation, true);

  // 전달 안전성 판단 과정에서 기존 경고 데이터를 변경하지 않습니다.
  assert.equal(warnings.length, 3);
});

test('잘못된 입력값은 안전하게 거부한다', () => {
  assert.throws(
    () => getHandoffSafetyState({
      warnings: null,
      reviewPendingCount: 0,
    }),
    TypeError
  );

  assert.throws(
    () => getHandoffSafetyState({
      warnings: [],
      reviewPendingCount: -1,
    }),
    TypeError
  );

  assert.throws(
    () => getHandoffSafetyState({
      warnings: [],
      reviewPendingCount: 1.5,
    }),
    TypeError
  );
});

test('실제 예시 데이터의 파싱 경고를 전달 안전성에 반영한다', () => {
  const rawText = [
    SAMPLE_KLAS_TEXT,
    '잘못된 과목 행',
  ].join('\n');

  const parsed = parseKlasText(rawText, {
    currentTermId: SAMPLE_CURRENT_TERM,
  });

  assert.equal(parsed.courses.length, 6);
  assert.equal(parsed.warnings.length, 1);

  const state = getHandoffSafetyState({
    warnings: parsed.warnings,
    reviewPendingCount: 0,
  });

  // 정상 과목이 모두 매칭되더라도 파싱 경고가 남아 있습니다.
  assert.equal(state.parsingWarningCount, 1);
  assert.equal(state.reviewPendingCount, 0);

  assert.equal(state.requiresConfirmation, true);
  assert.equal(state.isFullyReviewed, false);
});
