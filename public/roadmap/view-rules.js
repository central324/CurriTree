// 로드맵 화면의 보기 규칙 (화면과 분리된 순수 함수)

// 학년 섹션 크기: 확대·축소 없이(글자 크기 그대로) 화면 너비를 학년 섹션 수만큼 나눠 씁니다.
export const MIN_NODE_WIDTH = 150; // 이보다 좁아지면 줄이지 않고 가로 스크롤 (1024px 화면에서 학년 4개가 들어가는 크기)
export const MAX_NODE_WIDTH = 300; // 넓은 화면에서 과목 상자가 너무 길어지지 않게
export const MIN_COLUMN_GAP = 72; // 섹션 사이 빈칸 (화살표가 지나가는 세로 통로)
export const MAX_COLUMN_GAP = 160;
export const SECTION_PADDING = 16; // 학년 섹션 상자 안쪽 여백 (양옆)

/**
 * availableWidth: 그래프를 그릴 수 있는 너비(px), columnCount: 학년 섹션 수
 * 반환: { nodeWidth, columnWidth, width }
 *   - columnWidth: 섹션 가운데 사이 거리 (= 과목 상자 너비 + 섹션 사이 빈칸)
 *   - width: 섹션 상자 바깥까지 포함한 전체 너비 (availableWidth보다 크면 가로 스크롤)
 */
export function fitColumns(availableWidth, columnCount) {
  const count = Math.max(1, columnCount);
  const room = availableWidth - SECTION_PADDING * 2;
  const nodeWidth = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, (room - MIN_COLUMN_GAP * (count - 1)) / count));
  const gap = count > 1 ? Math.min(MAX_COLUMN_GAP, Math.max(MIN_COLUMN_GAP, (room - nodeWidth * count) / (count - 1))) : MIN_COLUMN_GAP;
  const columnWidth = nodeWidth + gap;
  return { nodeWidth, columnWidth, width: nodeWidth * count + gap * (count - 1) + SECTION_PADDING * 2 };
}

// 화살표를 보일지: 필수 선수(빨간 선)는 항상, 권장 선행(점선)은 고른 과목의 경로에 있을 때만.
export function isEdgeShown(relation, onSelectedPath) {
  return relation === 'hard' || onSelectedPath === true;
}
