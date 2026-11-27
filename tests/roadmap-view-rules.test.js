import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chooseZoom, isEdgeShown, MAX_ZOOM, MIN_READABLE_ZOOM } from '../public/roadmap/view-rules.js';

describe('로드맵 확대 비율 (chooseZoom)', () => {
  it('창에 다 들어오면 창 높이에 맞춘 비율을 쓴다', () => {
    assert.equal(chooseZoom(1000, 1000), 1);
  });

  it('창이 낮아도 글자가 읽히는 최소 비율 아래로 줄이지 않는다', () => {
    // 예전에는 1024×768 화면에서 0.52까지 줄어 과목 글자가 약 8px이었음
    assert.equal(chooseZoom(520, 1000), MIN_READABLE_ZOOM);
  });

  it('창이 아주 높아도 최대 비율을 넘지 않는다', () => {
    assert.equal(chooseZoom(5000, 1000), MAX_ZOOM);
  });

  it('그래프 높이가 0이거나 숫자가 아니면 최대 비율을 돌려준다', () => {
    assert.equal(chooseZoom(500, 0), MAX_ZOOM);
    assert.equal(chooseZoom(500, Number.NaN), MAX_ZOOM);
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
