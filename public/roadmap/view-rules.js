// 로드맵 화면의 보기 규칙 (화면과 분리된 순수 함수)

// 글자가 읽히는 최소 확대 비율. 과목 글자 17px × 0.9 ≈ 15px.
// 그래프가 창 높이보다 커지면 줄이지 않고 로드맵 창 안에서 위아래로 스크롤합니다.
export const MIN_READABLE_ZOOM = 0.9;
export const MAX_ZOOM = 1.3;

// availableHeight: 그래프를 그릴 수 있는 창 높이(px), graphHeight: 그래프 전체 높이(모델 좌표)
export function chooseZoom(availableHeight, graphHeight, { min = MIN_READABLE_ZOOM, max = MAX_ZOOM } = {}) {
  if (!(graphHeight > 0)) return max;
  const fit = availableHeight / graphHeight;
  return Math.min(max, Math.max(min, fit));
}

// 화살표를 보일지: 필수 선수(빨간 선)는 항상, 권장 선행(점선)은 고른 과목의 경로에 있을 때만.
export function isEdgeShown(relation, onSelectedPath) {
  return relation === 'hard' || onSelectedPath === true;
}
