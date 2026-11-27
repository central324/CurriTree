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

// 키보드로 과목 옮겨 다니기: 지금 과목에서 방향키를 누르면 갈 과목을 고릅니다.
// - items: 고를 수 있는 과목 [{ id, x, y }] (그래프 좌표, x가 같으면 같은 학년 섹션)
// - ↑↓: 같은 섹션 안 위·아래 과목 / ←→: 옆 섹션에서 높이가 가장 가까운 과목 / Home·End: 처음·마지막 과목
// - 지금 과목이 없으면(처음 방향키를 누를 때) 첫 과목. 더 갈 곳이 없으면 그대로.
export function nextCourseByKey(items, currentId, key) {
  if (items.length === 0) return null;
  const ordered = [...items].sort((a, b) => a.x - b.x || a.y - b.y);
  if (key === 'Home') return ordered[0].id;
  if (key === 'End') return ordered[ordered.length - 1].id;
  const current = items.find((item) => item.id === currentId);
  if (!current) return ordered[0].id;

  const sameColumn = (item) => Math.abs(item.x - current.x) < 1;
  let found;
  if (key === 'ArrowDown') found = ordered.find((item) => sameColumn(item) && item.y > current.y);
  else if (key === 'ArrowUp') found = ordered.filter((item) => sameColumn(item) && item.y < current.y).at(-1);
  else if (key === 'ArrowRight' || key === 'ArrowLeft') {
    const step = key === 'ArrowRight' ? 1 : -1;
    const columnXs = [...new Set(ordered.map((item) => item.x))].filter((x) => (x - current.x) * step >= 1);
    if (columnXs.length > 0) {
      const columnX = step > 0 ? Math.min(...columnXs) : Math.max(...columnXs);
      found = ordered
        .filter((item) => Math.abs(item.x - columnX) < 1)
        .reduce((best, item) => (!best || Math.abs(item.y - current.y) < Math.abs(best.y - current.y) ? item : best), null);
    }
  }
  return (found ?? current).id;
}
