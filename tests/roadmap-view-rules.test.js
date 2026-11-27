import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  fitColumns,
  isEdgeShown,
  MAX_COLUMN_GAP,
  MAX_NODE_WIDTH,
  MIN_COLUMN_GAP,
  MIN_NODE_WIDTH,
} from '../public/roadmap/view-rules.js';

describe('학년 섹션 크기 (fitColumns)', () => {
  it('보통 화면(1024px)에서는 학년 4개가 가로 스크롤 없이 화면 너비에 맞는다', () => {
    const fit = fitColumns(1024 - 48 - 48, 4);
    assert.ok(fit.width <= 1024 - 48 - 48 + 0.001);
    assert.ok(fit.nodeWidth >= MIN_NODE_WIDTH);
  });

  it('창이 좁으면 과목 상자를 최소 너비 아래로 줄이지 않고 가로 스크롤로 넘긴다', () => {
    const fit = fitColumns(400, 4);
    assert.equal(fit.nodeWidth, MIN_NODE_WIDTH);
    assert.equal(fit.columnWidth, MIN_NODE_WIDTH + MIN_COLUMN_GAP);
    assert.ok(fit.width > 400);
  });

  it('넓은 화면에서도 과목 상자와 섹션 사이 빈칸은 최대값을 넘지 않는다', () => {
    const fit = fitColumns(5000, 4);
    assert.equal(fit.nodeWidth, MAX_NODE_WIDTH);
    assert.equal(fit.columnWidth, MAX_NODE_WIDTH + MAX_COLUMN_GAP);
  });

  it('섹션이 1개여도 0으로 나누지 않는다', () => {
    const fit = fitColumns(800, 1);
    assert.ok(Number.isFinite(fit.columnWidth));
    assert.equal(fitColumns(800, 0).nodeWidth, fit.nodeWidth);
  });
});

describe('로드맵 화살표 표시 (isEdgeShown)', () => {
  it('필수 선수 선은 과목을 고르지 않아도 항상 보인다', () => {
    assert.equal(isEdgeShown('hard', false), true);
    assert.equal(isEdgeShown('hard', true), true);
  });

  it('권장 선행 선은 고른 과목의 경로에 있을 때만 보인다', () => {
    assert.equal(isEdgeShown('recommended', false), false);
    assert.equal(isEdgeShown('recommended', true), true);
  });
});
