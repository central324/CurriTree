// 로드맵 그래프에서 과목 노드를 어디에 둘지 계산합니다. (화면과 분리된 순수 함수)
// 가로: 권장 이수 학기 칸 (학기 미정 → 1-1 → … → 4-2), 세로: 칸 안에서 데이터 순서대로

export const TERM_COLUMNS = [
  { term: null, label: '학기 미정' },
  { term: '1-1', label: '1학년 1학기' },
  { term: '1-2', label: '1학년 2학기' },
  { term: '2-1', label: '2학년 1학기' },
  { term: '2-2', label: '2학년 2학기' },
  { term: '3-1', label: '3학년 1학기' },
  { term: '3-2', label: '3학년 2학기' },
  { term: '4-1', label: '4학년 1학기' },
  { term: '4-2', label: '4학년 2학기' },
];

export const COLUMN_WIDTH = 190;
export const ROW_HEIGHT = 64;
export const HEADER_OFFSET = 56; // 칸 제목과 첫 과목 사이 거리

/**
 * 과목마다 { x, y } 좌표와 칸 제목 좌표를 계산합니다.
 * 과목이 하나도 없는 칸(예: 학기 미정 과목이 없을 때)은 빼고 왼쪽부터 붙여 배치합니다.
 * 반환: { courses: Map<courseId, {x, y}>, columns: [{ term, label, x, y }] }
 */
export function computePositions(courses) {
  const byTerm = new Map(TERM_COLUMNS.map((column) => [column.term, []]));

  for (const course of courses) {
    const term = course.recommendedTerm ?? null;
    if (!byTerm.has(term)) throw new RangeError(`로드맵에 칸이 없는 권장 학기: ${term} (${course.id})`);
    byTerm.get(term).push(course.id);
  }

  const positions = new Map();
  const columns = [];

  for (const column of TERM_COLUMNS) {
    const ids = byTerm.get(column.term);
    if (ids.length === 0) continue;

    const x = columns.length * COLUMN_WIDTH;
    columns.push({ ...column, x, y: 0 });
    ids.forEach((id, row) => positions.set(id, { x, y: HEADER_OFFSET + row * ROW_HEIGHT }));
  }

  return { courses: positions, columns };
}
