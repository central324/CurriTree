// 과목 정보 팝업을 어디에 띄울지 고릅니다. (화면과 분리된 순수 함수)
//
// 로드맵 창 위에 일정 간격으로 후보 자리를 놓고, 각 자리에 대해
//   1순위: 가리면 안 되는 것(선택 과목·관련 과목·강조된 화살표·범례)과 겹치는 넓이가 가장 작은 곳
//   2순위: 지금 화면(view)에 다 보이는 곳 (스크롤이 덜 필요한 곳)
//   3순위: 선택한 과목에 가장 가까운 곳 (눈을 멀리 옮기지 않도록)
// 을 고릅니다. 팝업은 로드맵 창 아래로 넘어가도 되므로, 창 아래쪽 바깥은 빈 공간으로 봅니다.

const STEP = 16; // 후보 자리 간격
const MARGIN = 12; // 로드맵 창 가장자리와 띄울 거리
const MIN_VISIBLE = 140; // 팝업이 로드맵 창 안에 최소한 보여야 하는 높이

/**
 * - area: 로드맵 창 { width, height }
 * - popup: 팝업 크기 { width, height }
 * - obstacles: 가리면 안 되는 상자들 [{ x1, y1, x2, y2, weight? }] (로드맵 창 기준 좌표)
 *   weight: 겹친 넓이에 곱하는 값 (기본 1). 선택한 과목처럼 절대 가리면 안 되는 상자는 크게 줌
 * - anchor: 선택한 과목 중심 { x, y }
 * - minTop: 팝업 윗변이 내려와야 하는 최소 위치 (기본 MARGIN)
 * - maxTop: 팝업 윗변의 최대 위치. 주면 이 범위(지금 화면에 보이는 부분) 안에서만 고르고,
 *   빈 자리가 없으면 아래로 보내지 않고 가장 덜 가리는 자리를 씁니다.
 * - view: 지금 화면에 보이는 높이 { top, bottom } (선택). 주면 화면 밖으로 나가는 높이가 적은 곳을 먼저 고릅니다.
 * 반환: { left, top, overlap, offscreen } (overlap: 가린 넓이, 0이면 아무것도 안 가림 / offscreen: view 밖으로 나간 높이)
 */
export function choosePopupPosition({ area, popup, obstacles, anchor, minTop = MARGIN, maxTop: visibleMaxTop, view }) {
  const maxLeft = Math.max(MARGIN, area.width - popup.width - MARGIN);
  const maxTop = Math.max(minTop, visibleMaxTop ?? area.height - MIN_VISIBLE);

  let best = null;
  for (let top = minTop; top <= maxTop; top += STEP) {
    for (let left = MARGIN; left <= maxLeft; left += STEP) {
      const rect = { x1: left, y1: top, x2: left + popup.width, y2: top + popup.height };
      const overlap = obstacles.reduce((sum, box) => sum + overlapArea(rect, box) * (box.weight ?? 1), 0);
      const distance = distanceToRect(anchor, rect);
      const offscreen = view ? Math.max(0, view.top - rect.y1) + Math.max(0, rect.y2 - view.bottom) : 0;
      if (!best || isBetter({ overlap, offscreen, distance }, best)) best = { left, top, overlap, offscreen, distance };
    }
  }
  if (best.overlap === 0 || visibleMaxTop !== undefined) return { left: best.left, top: best.top, overlap: best.overlap, offscreen: best.offscreen };

  // 어디에 놓아도 경로를 가리면(경로가 창 전체에 퍼진 경우) 로드맵 창 바로 아래에 띄웁니다. (창 밖으로 나가도 됨)
  const left = Math.min(maxLeft, Math.max(MARGIN, anchor.x - popup.width / 2));
  return { left, top: area.height + MARGIN, overlap: 0, offscreen: 0 };
}

// 두 자리 비교: 덜 가림 → 화면 밖으로 덜 나감 → 과목에 더 가까움
export function isBetter(a, b) {
  if (a.overlap !== b.overlap) return a.overlap < b.overlap;
  if (a.offscreen !== b.offscreen) return a.offscreen < b.offscreen;
  return a.distance < b.distance;
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
