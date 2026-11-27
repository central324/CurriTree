// 전공 로드맵 키보드 이동 (public/roadmap/view-rules.js nextCourseByKey)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { nextCourseByKey } from '../public/roadmap/view-rules.js';

// 학년 섹션 3개: a(위)·b(아래) / c·d·e / f
const items = [
  { id: 'b', x: 0, y: 200 },
  { id: 'a', x: 0, y: 100 },
  { id: 'c', x: 300, y: 90 },
  { id: 'd', x: 300, y: 190 },
  { id: 'e', x: 300, y: 400 },
  { id: 'f', x: 600, y: 500 },
];

describe('nextCourseByKey', () => {
  test('처음 누르면(지금 과목 없음) 왼쪽 위 첫 과목', () => {
    assert.equal(nextCourseByKey(items, null, 'ArrowDown'), 'a');
    assert.equal(nextCourseByKey(items, 'missing', 'ArrowRight'), 'a');
  });

  test('↑↓는 같은 섹션 안에서 위·아래, 끝이면 그대로', () => {
    assert.equal(nextCourseByKey(items, 'a', 'ArrowDown'), 'b');
    assert.equal(nextCourseByKey(items, 'b', 'ArrowDown'), 'b');
    assert.equal(nextCourseByKey(items, 'e', 'ArrowUp'), 'd');
    assert.equal(nextCourseByKey(items, 'c', 'ArrowUp'), 'c');
  });

  test('←→는 옆 섹션에서 높이가 가장 가까운 과목, 끝 섹션이면 그대로', () => {
    assert.equal(nextCourseByKey(items, 'b', 'ArrowRight'), 'd');
    assert.equal(nextCourseByKey(items, 'e', 'ArrowRight'), 'f');
    assert.equal(nextCourseByKey(items, 'f', 'ArrowLeft'), 'e');
    assert.equal(nextCourseByKey(items, 'a', 'ArrowLeft'), 'a');
    assert.equal(nextCourseByKey(items, 'f', 'ArrowRight'), 'f');
  });

  test('Home·End는 처음·마지막 과목, 과목이 없으면 null', () => {
    assert.equal(nextCourseByKey(items, 'd', 'Home'), 'a');
    assert.equal(nextCourseByKey(items, 'a', 'End'), 'f');
    assert.equal(nextCourseByKey([], null, 'ArrowDown'), null);
  });
});
