import test from 'node:test';
import assert from 'node:assert/strict';

test('CI 병합 차단 동작 검증', () => {
  // 병합 제한 확인을 위해 의도적으로 실패시킵니다.
  assert.equal(1, 2);
});
