// 로드맵 그래프에서 과목 노드를 어디에 둘지 계산합니다. (화면과 분리된 순수 함수)
//
// 화면 전체를 학년별 4개 섹션(가로 4칸)으로 나눕니다.
//   ┌ 1학년 ┬ 2학년 ┬ 3학년 ┬ 4학년 ┐
//   │ 1학기 │ 1학기 │ 1학기 │ 1학기 │   ← 학기 제목 높이는 모든 학년이 같음
//   │ [과목]│ [과목]│ [과목]│ [과목]│   ← 행 높이도 모든 학년이 같아서, 학년을 건너뛰는 화살표가
//   │ 2학기 │ 2학기 │ 2학기 │ 2학기 │     과목 사이 틈(가로 통로)으로 지나갈 수 있음
//   │ [과목]│ [과목]│ [과목]│ [과목]│
//   └───────┴───────┴───────┴───────┘
//   - recommendedTerm "2-1"  → 2학년 섹션의 1학기
//   - recommendedTerm "1"    → 1학년 섹션의 1학기 과목들 아래 (학기 미지정 표시)
//   - recommendedTerm null   → 맨 오른쪽 "학기 미정" 섹션
//   - 과목이 가장 적은 학년(실제 데이터는 1학년)은 2학기를 1학기 바로 아래에 붙이고,
//     그 아래 빈 자리(panel)를 화면이 과목 정보 칸으로 씁니다.

// 기본 크기. 화면 쪽에서 화면 너비에 맞춰 nodeWidth·columnWidth를 정해 넘깁니다(computePositions의 dims).
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 52;
export const COLUMN_WIDTH = 272; // 학년 섹션 사이 거리 (과목 사이 빈칸 72px에 화살표 여러 개가 나란히 지나감)
export const ROW_HEIGHT = 80; // 행 사이 틈 28px에 가로 화살표가 지나감
export const HEADER_OFFSET = 74; // 학기 제목과 첫 과목 사이 거리 (첫 행 위에도 가로 통로가 생기도록)
export const SEMESTER_GAP = 16; // 1학기 마지막 과목과 2학기 제목 사이 추가 거리

export const DEFAULT_DIMS = {
  nodeWidth: NODE_WIDTH,
  nodeHeight: NODE_HEIGHT,
  columnWidth: COLUMN_WIDTH,
  rowHeight: ROW_HEIGHT,
  headerOffset: HEADER_OFFSET,
  semesterGap: SEMESTER_GAP,
};

const YEARS = [1, 2, 3, 4];
const TERM_FORMAT = /^([1-4])(?:-([12]))?$/;

function parseTerm(course) {
  if (course.recommendedTerm == null) return { year: null, semester: null };
  const match = TERM_FORMAT.exec(course.recommendedTerm);
  if (!match) throw new RangeError(`로드맵에 칸이 없는 권장 학기: ${course.recommendedTerm} (${course.id})`);
  return { year: Number(match[1]), semester: match[2] ? Number(match[2]) : null };
}

// 섹션(칸) 수: 과목이 있는 학년 수 + 학기 미정 과목이 있으면 1
export function countColumns(courses) {
  const keys = new Set(courses.map((course) => parseTerm(course).year));
  return keys.size;
}

/**
 * 반환
 * - courses: Map<courseId, { x, y, year, wholeYear }>  (year: 1~4, 학기 미정이면 null / wholeYear: 학년만 정해진 과목)
 * - years: [{ id, label, year, x }]                   학년 섹션 (과목이 있는 학년만, 학기 미정은 마지막)
 * - headers: [{ id, label, year, x, y }]              학기 제목
 * - columns: 섹션 가운데 x 목록, lastRowY: 맨 아래 행 y (섹션 높이를 맞출 때 씀)
 * - panel: { year, x, top, bottom } 과목이 가장 적은 학년 섹션의 빈 자리 (섹션이 2개 이상일 때만, 아니면 null)
 * - width, height: 과목 상자 바깥 기준 전체 크기
 * - dims: 배치에 쓴 크기 (routeEdges가 같은 값을 씀)
 * dims: DEFAULT_DIMS 중 바꿀 값만 넘깁니다.
 */
export function computePositions(courses, dimsOverride = {}) {
  const dims = { ...DEFAULT_DIMS, ...dimsOverride };
  const { nodeWidth, nodeHeight, columnWidth, rowHeight, headerOffset, semesterGap } = dims;
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

  const presentYears = YEARS.filter((year) => groups.has(year));
  // 1학기 영역 행 수는 모든 학년 중 가장 많은 수로 맞춤 → 2학기 제목이 모든 학년에서 같은 높이
  const firstRows = Math.max(1, unknown.length, ...presentYears.map((year) => groups.get(year)[1].length + groups.get(year).whole.length));
  const secondHeaderY = headerOffset + firstRows * rowHeight + semesterGap;
  const firstRowY = (row) => headerOffset + row * rowHeight;
  const secondRowY = (row) => secondHeaderY + headerOffset + row * rowHeight;

  // 과목이 가장 적은 학년 (같으면 앞 학년)
  const totals = presentYears.map((year) => Object.values(groups.get(year)).reduce((sum, list) => sum + list.length, 0));
  const compactYear = presentYears.length > 1 ? presentYears[totals.indexOf(Math.min(...totals))] : null;
  let panel = null;

  const positions = new Map();
  const years = [];
  const headers = [];
  let lastRowY = firstRowY(0);
  let column = 0;

  for (const year of presentYears) {
    const group = groups.get(year);
    const x = column * columnWidth;
    const first = [...group[1], ...group.whole];
    years.push({ id: `year:${year}`, label: `${year}학년`, year, x });
    headers.push({ id: `term:${year}-1`, label: '1학기', year, x, y: 0 });
    first.forEach((id, row) => {
      positions.set(id, { x, y: firstRowY(row), year, wholeYear: row >= group[1].length });
    });

    if (year === compactYear) {
      // 2학기 제목을 1학기 마지막 과목 바로 다음 줄에 (다른 학년과 같은 격자 위라 화살표 틈은 그대로)
      headers.push({ id: `term:${year}-2`, label: '2학기', year, x, y: firstRowY(first.length) });
      group[2].forEach((id, row) => positions.set(id, { x, y: firstRowY(first.length + 1 + row), year, wholeYear: false }));
      panel = { year, x, top: firstRowY(first.length + group[2].length) + rowHeight / 2, bottom: null };
    } else {
      headers.push({ id: `term:${year}-2`, label: '2학기', year, x, y: secondHeaderY });
      group[2].forEach((id, row) => positions.set(id, { x, y: secondRowY(row), year, wholeYear: false }));
    }
    column += 1;
  }

  if (unknown.length > 0) {
    const x = column * columnWidth;
    years.push({ id: 'year:none', label: '학기 미정', year: null, x });
    headers.push({ id: 'term:none', label: '확인 필요', year: null, x, y: 0 });
    unknown.forEach((id, row) => positions.set(id, { x, y: firstRowY(row), year: null, wholeYear: false }));
    column += 1;
  }
  lastRowY = Math.max(lastRowY, ...[...positions.values()].map((position) => position.y));
  if (panel) panel.bottom = lastRowY + nodeHeight / 2;

  return {
    courses: positions,
    years,
    headers,
    columns: years.map((year) => year.x),
    lastRowY,
    panel,
    width: Math.max(0, (column - 1) * columnWidth + nodeWidth),
    height: lastRowY + nodeHeight / 2,
    dims,
  };
}

// ---------------------------------------------------------------------------
// 화살표 길 찾기: 가로·세로 직선으로만 잇고, 화살표끼리 겹치지 않게 서로 떨어뜨립니다.
//
//  1) 붙는 자리(포트): 한 과목에 화살표가 여러 개 붙으면 상자 옆면에서 위아래로 나눠 붙입니다.
//  2) 세로선: 칸 사이 빈칸(세로 통로)마다 세로로 겹치는 선들에 서로 다른 트랙(x)을 줍니다.
//  3) 가로선: 사이에 칸이 있는 긴 화살표는 행 사이 틈(가로 통로)으로 지나가며, 겹치면 서로 다른 트랙(y)을 줍니다.
//
//      [앞] ─┐                       ┌─▶ [뒤]
//            │  (세로 통로, 트랙별 x) │
//            └──── (가로 통로, 트랙별 y) ────┘
// ---------------------------------------------------------------------------

export const TRACK_SPACING = 10; // 나란히 지나가는 화살표 사이 거리
export const PORT_SPACING = 8; // 한 과목 옆면에 붙는 화살표 사이 거리 (격자 자리가 모자랄 때)
const TRACK_MARGIN = 10; // 같은 트랙을 이어 쓸 때 위아래 최소 간격
const GAP_PADDING = 10; // 통로 양끝에서 띄울 거리

// 포트 높이 격자: 오른쪽 옆면은 0, ±10, ±20…, 왼쪽 옆면은 ±5, ±15…
// 같은 행에서 마주 보는 "나가는 토막"과 "들어오는 토막"이 같은 높이가 되지 않도록 서로 어긋나게 둡니다.
const PORT_GRID = 10;
function portOffsets(count, side, limit) {
  const phase = side === 'right' ? 0 : PORT_GRID / 2;
  const candidates = [];
  for (let k = -3; k <= 3; k += 1) candidates.push(phase + k * PORT_GRID);
  const chosen = candidates
    .filter((y) => Math.abs(y) <= limit)
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
  // 격자 자리가 모자라면(화살표가 아주 많으면) 고르게 압축
  return chosen.length === count ? chosen : spread(count, PORT_SPACING, limit);
}

// 개수만큼 가운데를 중심으로 고르게 나눈 위치(오프셋) 목록
function spread(count, spacing, limit) {
  const step = count > 1 ? Math.min(spacing, (2 * limit) / (count - 1)) : 0;
  return Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * step);
}

// 구간 [start, end]들이 서로 겹치지 않게 트랙 번호를 매깁니다. (구간 분할 탐욕 알고리즘)
function assignTracks(items) {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const trackEnds = [];
  for (const item of sorted) {
    let track = trackEnds.findIndex((end) => end + TRACK_MARGIN < item.start);
    if (track === -1) {
      track = trackEnds.length;
      trackEnds.push(item.end);
    } else {
      trackEnds[track] = item.end;
    }
    item.track = track;
  }
  return trackEnds.length;
}

function groupBy(list, keyOf) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * 화살표 여러 개의 경로를 한꺼번에 계산합니다.
 * - edges: [{ id, sourceId, targetId }]  (앞 과목 → 뒤 과목)
 * - layout: computePositions 결과
 * 반환: Map<id, { sourcePort, targetPort, points }>
 *   - sourcePort / targetPort: 과목 중심에서 화살표가 붙는 곳까지의 상대 좌표 { x, y }
 *   - points: 꺾이는 점들의 절대 좌표 [{ x, y }] (붙는 곳 사이, 가로·세로 선분으로만 이어짐)
 */
export function routeEdges(edges, layout) {
  const { nodeWidth: NODE_WIDTH, nodeHeight: NODE_HEIGHT, columnWidth: COLUMN_WIDTH, rowHeight: ROW_HEIGHT } = layout.dims ?? DEFAULT_DIMS;
  const portLimit = NODE_HEIGHT / 2 - 5; // 포트가 상자 모서리에 너무 붙지 않도록
  const half = NODE_WIDTH / 2;
  const columns = layout.columns;
  const count = columns.length;
  const position = (id) => layout.courses.get(id);

  // 세로 통로 k: k번째 칸 왼쪽 빈칸 (0 = 맨 앞, count = 맨 뒤)
  const gapRegion = (k) => [
    k === 0 ? columns[0] - half - (COLUMN_WIDTH - NODE_WIDTH) : columns[k - 1] + half,
    k === count ? columns[count - 1] + half + (COLUMN_WIDTH - NODE_WIDTH) : columns[k] - half,
  ];
  const exitGap = (rightEdge) => {
    for (let k = 1; k <= count; k += 1) if (gapRegion(k)[0] >= rightEdge - 0.5) return k;
    return count;
  };
  const enterGap = (leftEdge) => {
    for (let k = count - 1; k >= 0; k -= 1) if (gapRegion(k)[1] <= leftEdge + 0.5) return k;
    return 0;
  };

  // 경로 종류: 뒤 과목이 오른쪽 칸이면 'forward', 같은 칸(또는 왼쪽)이면 'back'(오른쪽 통로로 돌아 상자 오른쪽에 붙음)
  const routes = edges.map((edge) => {
    const source = position(edge.sourceId);
    const target = position(edge.targetId);
    const exit = exitGap(source.x + half);
    const back = enterGap(target.x - half) < exit;
    const enter = back ? exit : enterGap(target.x - half);
    return { edge, source, target, exit, enter, back, verticals: [] };
  });

  // 1) 포트: 상자 오른쪽(나가는 화살표 + 'back'으로 들어오는 화살표)과 왼쪽(들어오는 화살표)을 따로 나눠 줍니다.
  //    상대 과목이 위에 있을수록 위쪽 포트를 써서 화살표끼리 덜 엇갈리게 합니다.
  const sides = new Map(); // `${과목}|right` → [{ route, end: 'source' | 'target', other }]
  const addToSide = (courseId, side, item) => {
    const key = `${courseId}|${side}`;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push(item);
  };
  for (const route of routes) {
    addToSide(route.edge.sourceId, 'right', { route, end: 'source', other: route.target });
    addToSide(route.edge.targetId, route.back ? 'right' : 'left', { route, end: 'target', other: route.source });
  }
  for (const [key, list] of sides) {
    const offsets = portOffsets(list.length, key.endsWith('|right') ? 'right' : 'left', portLimit);
    list
      .sort((a, b) => a.other.y - b.other.y || a.other.x - b.other.x)
      .forEach((item, index) => (item.route[`${item.end}Offset`] = offsets[index]));
  }
  for (const route of routes) {
    route.sy = route.source.y + route.sourceOffset;
    route.ty = route.target.y + route.targetOffset;
  }

  // 2) 가로 통로: 사이에 칸이 있으면 뒤 과목 행 바로 위 틈으로 지나갑니다. 겹치는 가로선끼리 트랙(y)을 나눕니다.
  const rowGap = ROW_HEIGHT - NODE_HEIGHT;
  const gapMiddle = (k) => (gapRegion(k)[0] + gapRegion(k)[1]) / 2;
  for (const route of routes) {
    if (route.exit === route.enter) continue;
    const center = route.target.y - ROW_HEIGHT / 2;
    route.lane = { key: center, center, start: gapMiddle(route.exit), end: gapMiddle(route.enter) };
  }
  const lanes = routes.filter((route) => route.lane).map((route) => route.lane);
  for (const group of groupBy(lanes, (lane) => lane.key).values()) {
    const offsets = spread(assignTracks(group), TRACK_SPACING, rowGap / 2 - 4);
    for (const lane of group) lane.y = lane.center + offsets[lane.track];
  }

  // 3) 세로선 만들기. 각 세로선은 왼쪽으로 뻗는 가로 토막(leftStubs)과 오른쪽으로 뻗는 토막(rightStubs)의 높이를 기억합니다.
  for (const route of routes) {
    const { sy, ty, exit, enter, lane, back } = route;
    if (lane) {
      route.verticals.push({ route, gap: exit, start: Math.min(sy, lane.y), end: Math.max(sy, lane.y), leftStubs: [sy], rightStubs: [] });
      route.verticals.push({ route, gap: enter, start: Math.min(lane.y, ty), end: Math.max(lane.y, ty), leftStubs: [], rightStubs: [ty] });
    } else if (back || sy !== ty) {
      route.verticals.push({
        route,
        gap: exit,
        start: Math.min(sy, ty),
        end: Math.max(sy, ty),
        leftStubs: back ? [sy, ty] : [sy],
        rightStubs: back ? [] : [ty],
      });
    }
  }

  // 4) 세로 통로마다 트랙(x)을 나눕니다.
  //    - 위아래로 겹치는 세로선은 다른 트랙
  //    - 같은 높이에 "왼쪽 토막"과 "오른쪽 토막"이 있으면, 왼쪽 토막을 가진 선이 더 왼쪽 트랙 (토막끼리 겹치지 않게)
  const sameHeight = (a, b) => Math.abs(a - b) <= PORT_GRID / 2 + 0.5; // 5px 차이도 되도록 엇갈리지 않게 순서를 맞춤
  const mustBeLeft = (a, b) => a.leftStubs.some((y) => b.rightStubs.some((other) => sameHeight(y, other)));
  const allVerticals = routes.flatMap((route) => route.verticals);
  for (const [gap, verticals] of groupBy(allVerticals, (vertical) => vertical.gap)) {
    const tracks = []; // [{ items, end }]
    for (const vertical of [...verticals].sort((a, b) => a.start - b.start || a.end - b.end)) {
      let track = tracks.find(
        (candidate) =>
          candidate.end + TRACK_MARGIN < vertical.start &&
          candidate.items.every((item) => !mustBeLeft(item, vertical) && !mustBeLeft(vertical, item)),
      );
      if (!track) {
        track = { items: [], end: -Infinity };
        tracks.push(track);
      }
      track.items.push(vertical);
      track.end = vertical.end;
    }

    // 트랙 순서: "왼쪽이어야 함" 조건을 지키는 순서(위상 정렬). 조건이 없으면 나가는 선 → 지나가는 선 → 들어오는 선
    const weight = (track) => track.items.reduce((sum, item) => sum + item.rightStubs.length - item.leftStubs.length, 0);
    const remaining = [...tracks].sort((a, b) => weight(a) - weight(b));
    const ordered = [];
    while (remaining.length > 0) {
      const index = remaining.findIndex((track) =>
        remaining.every((other) => other === track || !other.items.some((a) => track.items.some((b) => mustBeLeft(a, b)))),
      );
      ordered.push(...remaining.splice(index === -1 ? 0 : index, 1));
    }

    const [left, right] = gapRegion(gap);
    const offsets = spread(ordered.length, TRACK_SPACING, (right - left) / 2 - GAP_PADDING);
    ordered.forEach((track, index) => {
      for (const vertical of track.items) vertical.x = (left + right) / 2 + offsets[index];
    });
  }

  // 5) 꺾이는 점으로 정리
  const result = new Map();
  for (const route of routes) {
    const { edge, sy, ty, verticals, lane, back } = route;
    let points = [];
    if (lane) {
      const [first, second] = verticals;
      points = [
        { x: first.x, y: sy },
        { x: first.x, y: lane.y },
        { x: second.x, y: lane.y },
        { x: second.x, y: ty },
      ];
    } else if (verticals.length === 1) {
      points = [
        { x: verticals[0].x, y: sy },
        { x: verticals[0].x, y: ty },
      ];
    }
    result.set(edge.id, {
      sourcePort: { x: half, y: route.sourceOffset },
      targetPort: { x: back ? half : -half, y: route.targetOffset },
      points,
    });
  }
  return result;
}
