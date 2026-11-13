// 과목 정보 팝업을 어디에 띄울지 고릅니다. (화면과 분리된 순수 함수)
//
// 로드맵 창 위에 일정 간격으로 후보 자리를 놓고, 각 자리에 대해
//   1순위: 가리면 안 되는 것(선택 과목·관련 과목·강조된 화살표·범례)과 겹치는 넓이가 가장 작은 곳
//   2순위: 선택한 과목에 가장 가까운 곳 (눈을 멀리 옮기지 않도록)
// 을 고릅니다. 팝업은 로드맵 창 아래로 넘어가도 되므로, 창 아래쪽 바깥은 빈 공간으로 봅니다.

const STEP = 16; // 후보 자리 간격
const MARGIN = 12; // 로드맵 창 가장자리와 띄울 거리
const MIN_VISIBLE = 140; // 팝업이 로드맵 창 안에 최소한 보여야 하는 높이

/**
 * - area: 로드맵 창 { width, height }
 * - popup: 팝업 크기 { width, height }
 * - obstacles: 가리면 안 되는 상자들 [{ x1, y1, x2, y2 }] (로드맵 창 기준 좌표)
 * - anchor: 선택한 과목 중심 { x, y }
 * - minTop: 팝업 윗변이 내려와야 하는 최소 위치 (기본 MARGIN)
 * 반환: { left, top, overlap } (overlap: 가린 넓이, 0이면 아무것도 안 가림)
 */
export function choosePopupPosition({ area, popup, obstacles, anchor, minTop = MARGIN }) {
  const maxLeft = Math.max(MARGIN, area.width - popup.width - MARGIN);
  const maxTop = Math.max(minTop, area.height - MIN_VISIBLE);

  let best = null;
  for (let top = minTop; top <= maxTop; top += STEP) {
    for (let left = MARGIN; left <= maxLeft; left += STEP) {
      const rect = { x1: left, y1: top, x2: left + popup.width, y2: top + popup.height };
      const overlap = obstacles.reduce((sum, box) => sum + overlapArea(rect, box), 0);
      const distance = distanceToRect(anchor, rect);
      if (!best || overlap < best.overlap || (overlap === best.overlap && distance < best.distance)) {
        best = { left, top, overlap, distance };
      }
    }
  }
  if (best.overlap === 0) return { left: best.left, top: best.top, overlap: 0 };

  // 어디에 놓아도 경로를 가리면(경로가 창 전체에 퍼진 경우) 로드맵 창 바로 아래에 띄웁니다. (창 밖으로 나가도 됨)
  const left = Math.min(maxLeft, Math.max(MARGIN, anchor.x - popup.width / 2));
  return { left, top: area.height + MARGIN, overlap: 0 };
}

export function overlapArea(a, b) {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return width > 0 && height > 0 ? width * height : 0;
}

function distanceToRect(point, rect) {
  const dx = Math.max(rect.x1 - point.x, 0, point.x - rect.x2);
  const dy = Math.max(rect.y1 - point.y, 0, point.y - rect.y2);
  return Math.hypot(dx, dy);
}
