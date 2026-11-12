// 로드맵 그래프에서 과목 노드를 어디에 둘지 계산합니다. (화면과 분리된 순수 함수)
//
// 가로: 학년 묶음(1~4학년) 안에 1학기·2학기 칸, 세로: 칸 안에서 데이터 순서대로
//   - recommendedTerm "2-1"  → 2학년 1학기 칸
//   - recommendedTerm "1"    → 1학년 묶음의 두 칸 가운데 (학기 무관 과목), 학기 과목들 아래
//   - recommendedTerm null   → 맨 오른쪽 "학기 미정" 묶음

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 40;
export const COLUMN_WIDTH = 190; // 같은 학년 안 학기 칸 사이 거리 (과목 사이 빈칸 40px에 화살표가 지나감)
export const YEAR_GAP = 60; // 학년 묶음 사이 추가 거리
export const ROW_HEIGHT = 56;
export const HEADER_OFFSET = 44; // 학기 제목과 첫 과목 사이 거리

const YEARS = [1, 2, 3, 4];
const SEMESTERS = [1, 2];
const TERM_FORMAT = /^([1-4])(?:-([12]))?$/;

function parseTerm(course) {
  if (course.recommendedTerm == null) return { year: null, semester: null };
  const match = TERM_FORMAT.exec(course.recommendedTerm);
  if (!match) throw new RangeError(`로드맵에 칸이 없는 권장 학기: ${course.recommendedTerm} (${course.id})`);
  return { year: Number(match[1]), semester: match[2] ? Number(match[2]) : null };
}

/**
 * 반환
 * - courses: Map<courseId, { x, y, year }>  (year: 1~4, 학기 미정이면 null)
 * - years: [{ id, label, year }]            학년 묶음 (과목이 있는 학년만, 학기 미정은 마지막)
 * - headers: [{ id, label, year, x, y }]    학기 칸 제목
 * - width, height: 노드 중심 기준 전체 크기
 */
export function computePositions(courses) {
  const groups = new Map(); // year → { 1: [], 2: [], whole: [] }
  const unknown = [];

  for (const course of courses) {
    const { year, semester } = parseTerm(course);
    if (year === null) {
      unknown.push(course.id);
      continue;
    }
    if (!groups.has(year)) groups.set(year, { 1: [], 2: [], whole: [] });
    groups.get(year)[semester ?? 'whole'].push(course.id);
  }

  const positions = new Map();
  const years = [];
  const headers = [];
  let left = 0;
  let maxRows = 0;

  for (const year of YEARS) {
    const group = groups.get(year);
    if (!group) continue;

    years.push({ id: `year:${year}`, label: `${year}학년`, year });
    for (const semester of SEMESTERS) {
      const x = left + (semester - 1) * COLUMN_WIDTH;
      headers.push({ id: `term:${year}-${semester}`, label: `${semester}학기`, year, x, y: 0 });
      group[semester].forEach((id, row) => positions.set(id, { x, y: HEADER_OFFSET + row * ROW_HEIGHT, year }));
    }

    const firstWholeRow = Math.max(group[1].length, group[2].length);
    group.whole.forEach((id, index) => {
      positions.set(id, {
        x: left + COLUMN_WIDTH / 2,
        y: HEADER_OFFSET + (firstWholeRow + index) * ROW_HEIGHT,
        year,
      });
    });

    maxRows = Math.max(maxRows, firstWholeRow + group.whole.length);
    left += 2 * COLUMN_WIDTH + YEAR_GAP;
  }

  if (unknown.length > 0) {
    years.push({ id: 'year:none', label: '학기 미정', year: null });
    headers.push({ id: 'term:none', label: '확인 필요', year: null, x: left, y: 0 });
    unknown.forEach((id, row) => positions.set(id, { x: left, y: HEADER_OFFSET + row * ROW_HEIGHT, year: null }));
    maxRows = Math.max(maxRows, unknown.length);
    left += COLUMN_WIDTH + YEAR_GAP;
  }

  return {
    courses: positions,
    years,
    headers,
    columns: headers.map((header) => header.x).sort((a, b) => a - b),
    width: Math.max(0, left - YEAR_GAP - COLUMN_WIDTH + NODE_WIDTH),
    height: HEADER_OFFSET + Math.max(0, maxRows - 1) * ROW_HEIGHT + NODE_HEIGHT,
  };
}

/**
 * 화살표가 꺾이는 지점들을 계산합니다. 가로·세로 직선으로만 이어지고, 과목 상자를 가로지르지 않습니다.
 * - source, target: 과목 중심 좌표 { x, y }
 * - columns: 학기 칸 중심 x 목록 (computePositions의 columns)
 * 반환: 꺾이는 점 [{ x, y }] (시작·끝 과목 중심은 빼고)
 *
 *  바로 다음 칸: 두 과목 사이 빈칸에서 한 번 세로로 꺾음
 *      [앞] ─┐
 *            └─▶ [뒤]
 *  사이에 칸이 있음: 앞 과목 오른쪽 빈칸 → 뒤 과목 위쪽 행 사이 틈(가로) → 뒤 과목 왼쪽 빈칸
 *      [앞] ─┐
 *            └──────(행 사이 틈)──────┐
 *                                     └─▶ [뒤]
 */
export function routeEdge(source, target, columns) {
  const half = NODE_WIDTH / 2;
  const sourceRight = source.x + half;
  const targetLeft = target.x - half;

  // 뒤 과목이 같은 칸이거나 왼쪽: 오른쪽으로 돌아 들어감
  if (targetLeft <= sourceRight) {
    const x = Math.max(source.x, target.x) + half + (COLUMN_WIDTH - NODE_WIDTH) / 2;
    return [
      { x, y: source.y },
      { x, y: target.y },
    ];
  }

  const between = columns.filter((x) => x - half >= sourceRight && x + half <= targetLeft);

  if (between.length === 0) {
    const x = (sourceRight + targetLeft) / 2;
    return source.y === target.y ? [] : [
      { x, y: source.y },
      { x, y: target.y },
    ];
  }

  const exitX = (sourceRight + (between[0] - half)) / 2;
  const enterX = (between.at(-1) + half + targetLeft) / 2;
  const laneY = target.y - ROW_HEIGHT / 2; // 뒤 과목 행과 그 위 행 사이 틈
  return [
    { x: exitX, y: source.y },
    { x: exitX, y: laneY },
    { x: enterX, y: laneY },
    { x: enterX, y: target.y },
  ];
}
