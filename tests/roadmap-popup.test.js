// 과목 정보 팝업 자리 고르기 (public/roadmap/popup-position.js)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { choosePopupPosition, overlapArea } from '../public/roadmap/popup-position.js';

const area = { width: 1200, height: 700 };
const popup = { width: 400, height: 500 };
const rectOf = ({ left, top }) => ({ x1: left, y1: top, x2: left + popup.width, y2: top + popup.height });

describe('choosePopupPosition', () => {
  test('가리면 안 되는 상자와 겹치지 않는 자리를 고른다', () => {
    const obstacles = [
      { x1: 0, y1: 0, x2: 600, y2: 300 }, // 왼쪽 위 경로
      { x1: 650, y1: 100, x2: 700, y2: 650 }, // 가운데 세로 화살표
    ];
    const position = choosePopupPosition({ area, popup, obstacles, anchor: { x: 300, y: 150 } });
    assert.equal(position.overlap, 0);
    for (const box of obstacles) assert.equal(overlapArea(rectOf(position), box), 0);
  });

  test('겹치지 않는 자리 중에서는 선택 과목에 가장 가까운 곳', () => {
    const obstacles = [{ x1: 500, y1: 300, x2: 700, y2: 360 }]; // 선택 과목 하나
    const anchor = { x: 600, y: 330 };
    const position = choosePopupPosition({ area, popup, obstacles, anchor });
    assert.equal(position.overlap, 0);
    const rect = rectOf(position);
    // 과목 상자 바로 옆(16px 간격 이내)에 붙어 있어야 함
    const gapX = Math.max(rect.x1 - 700, 500 - rect.x2, 0);
    const gapY = Math.max(rect.y1 - 360, 300 - rect.y2, 0);
    assert.ok(Math.max(gapX, gapY) <= 16, JSON.stringify(position));
  });

  test('로드맵 창 아래로 넘어가는 자리도 쓸 수 있다 (창 아래쪽은 빈 공간)', () => {
    // 창 위쪽 2/3를 경로가 꽉 채움
    const obstacles = [{ x1: 0, y1: 0, x2: 1200, y2: 520 }];
    const position = choosePopupPosition({ area, popup, obstacles, anchor: { x: 600, y: 200 } });
    assert.equal(position.overlap, 0);
    assert.ok(position.top >= 520);
    assert.ok(position.top + popup.height > area.height);
  });

  test('어디에 놓아도 가리면 로드맵 창 바로 아래에 띄운다', () => {
    const obstacles = [{ x1: 0, y1: 0, x2: 1200, y2: 700 }];
    const position = choosePopupPosition({ area, popup, obstacles, anchor: { x: 900, y: 300 } });
    assert.equal(position.overlap, 0);
    assert.ok(position.top >= area.height);
    assert.ok(position.left + popup.width <= area.width);
  });

  test('선택 과목 하나만 있어도 그 과목 상자는 가리지 않는다', () => {
    // 화면 쪽(roadmap.js)은 선택 과목을 항상 obstacles에 넣음
    const obstacles = [{ x1: 100, y1: 100, x2: 300, y2: 160 }];
    const position = choosePopupPosition({ area, popup, obstacles, anchor: { x: 200, y: 130 } });
    assert.equal(overlapArea(rectOf(position), obstacles[0]), 0);
  });
});
