import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getHandoffSafetyState,
  getHandoffConfirmationMessage,
  confirmHandoffWithUser,
} from '../public/klas/handoff-safety.js';

function createSafetyState(
  parsingWarningCount,
  reviewPendingCount
) {
  const warnings = Array.from(
    { length: parsingWarningCount },
    (_, index) => ({
      lineNumber: index + 1,
      reason: 'ROW_FORMAT_INVALID',
    })
  );

  return getHandoffSafetyState({
    warnings,
    reviewPendingCount,
  });
}

test('경고가 없으면 확인 창을 호출하지 않는다', () => {
  const safety = createSafetyState(0, 0);

  let confirmCalls = 0;

  const result = confirmHandoffWithUser(
    safety,
    () => {
      confirmCalls += 1;
      return true;
    }
  );

  assert.equal(result, true);
  assert.equal(confirmCalls, 0);

  assert.equal(
    getHandoffConfirmationMessage(safety),
    null
  );
});

test('파싱 경고만 있으면 사용자 확인이 필요하다', () => {
  const safety = createSafetyState(1, 0);

  let confirmCalls = 0;

  const result = confirmHandoffWithUser(
    safety,
    (message) => {
      confirmCalls += 1;

      assert.match(message, /파싱 경고 1건/);
      assert.match(message, /분석에서 제외/);

      return true;
    }
  );

  assert.equal(result, true);
  assert.equal(confirmCalls, 1);
});

test('미확정 수강 기록만 있는 경우도 확인한다', () => {
  const safety = createSafetyState(0, 2);

  const message = getHandoffConfirmationMessage(safety);

  assert.match(message, /수강 기록 확인 필요 2건/);
  assert.doesNotMatch(message, /파싱 경고 0건/);
});

test('두 경고가 동시에 있어도 확인 창은 한 번만 호출한다', () => {
  const safety = createSafetyState(2, 3);

  let confirmCalls = 0;

  const result = confirmHandoffWithUser(
    safety,
    (message) => {
      confirmCalls += 1;

      assert.match(message, /파싱 경고 2건/);
      assert.match(message, /수강 기록 확인 필요 3건/);

      return true;
    }
  );

  assert.equal(result, true);
  assert.equal(confirmCalls, 1);
});

test('사용자가 취소하면 전달을 진행하지 않는다', () => {
  const safety = createSafetyState(1, 0);

  const result = confirmHandoffWithUser(
    safety,
    () => false
  );

  assert.equal(result, false);
});

test('사용자가 명시적으로 동의하면 전달을 허용한다', () => {
  const safety = createSafetyState(1, 2);

  const result = confirmHandoffWithUser(
    safety,
    () => true
  );

  assert.equal(result, true);
});

test('명시적인 동의가 아니면 전달을 거부한다', () => {
  const safety = createSafetyState(1, 0);

  assert.equal(
    confirmHandoffWithUser(safety, () => undefined),
    false
  );

  assert.equal(
    confirmHandoffWithUser(safety, () => 'yes'),
    false
  );
});

test('경고가 있는데 확인 함수가 없으면 오류를 발생시킨다', () => {
  const safety = createSafetyState(1, 0);

  assert.throws(
    () => confirmHandoffWithUser(safety, null),
    TypeError
  );
});
