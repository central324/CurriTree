// 전공 로드맵 화면 (public/roadmap/)
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { computePositions, NODE_HEIGHT, NODE_WIDTH, routeEdges } from '../public/roadmap/positions.js';
import { RECOMMENDED_TERM_PATTERN } from '../shared/curriculum/schema.js';
import { createApp } from '../server/app.js';
import { loadRealCurriculum, makeCourse } from './helpers/curriculum.js';

const at = (positions, id) => positions.courses.get(id);

describe('computePositions', () => {
  test('계약이 허용하는 모든 권장 학기 값(1-1 ~ 4-2, 1 ~ 4, null)에 자리가 있다', () => {
    const terms = [null];
    for (const year of [1, 2, 3, 4]) terms.push(String(year), `${year}-1`, `${year}-2`);
    for (const term of terms) {
      if (term !== null) assert.match(term, RECOMMENDED_TERM_PATTERN);
      const positions = computePositions([makeCourse({ id: 'a', recommendedTerm: term })]);
      assert.ok(at(positions, 'a'), String(term));
    }
  });

  test('실제 교육과정의 모든 과목에 좌표가 있고, 과목 상자끼리 겹치지 않는다', () => {
    const { courses } = loadRealCurriculum();
    const positions = computePositions(courses);
    assert.equal(positions.courses.size, courses.length);
    const list = [...positions.courses.entries()];
    for (const [i, [idA, a]] of list.entries()) {
      for (const [idB, b] of list.slice(i + 1)) {
        const overlap = Math.abs(a.x - b.x) < NODE_WIDTH && Math.abs(a.y - b.y) < NODE_HEIGHT;
        assert.ok(!overlap, `${idA} ↔ ${idB}`);
      }
    }
  });

  test('학년별로 묶고, 학년 안에서 1학기 칸 → 2학기 칸 순서로 놓는다', () => {
    const positions = computePositions([
      makeCourse({ id: 'y2s1', recommendedTerm: '2-1' }),
      makeCourse({ id: 'y1s2', recommendedTerm: '1-2' }),
      makeCourse({ id: 'y1s1', recommendedTerm: '1-1' }),
      makeCourse({ id: 'y2s1b', recommendedTerm: '2-1' }),
    ]);
    assert.deepEqual(positions.years.map((year) => year.label), ['1학년', '2학년']);
    assert.ok(at(positions, 'y1s1').x < at(positions, 'y1s2').x);
    assert.ok(at(positions, 'y1s2').x < at(positions, 'y2s1').x);
    assert.equal(at(positions, 'y2s1').x, at(positions, 'y2s1b').x);
    assert.ok(at(positions, 'y2s1').y < at(positions, 'y2s1b').y);
    assert.equal(at(positions, 'y1s1').year, 1);
  });

  test('학기를 정하지 않은 학년 과목("1")은 그 학년 두 칸 가운데, 학기 과목들 아래에 놓는다', () => {
    const positions = computePositions([
      makeCourse({ id: 's1', recommendedTerm: '1-1' }),
      makeCourse({ id: 's2', recommendedTerm: '1-2' }),
      makeCourse({ id: 'whole', recommendedTerm: '1' }),
    ]);
    const whole = at(positions, 'whole');
    assert.equal(whole.x, (at(positions, 's1').x + at(positions, 's2').x) / 2);
    assert.ok(whole.y > at(positions, 's1').y);
    assert.equal(whole.year, 1);
  });

  test('실제 데이터: 공학설계입문은 1학년 묶음에 들어간다', () => {
    const positions = computePositions(loadRealCurriculum().courses);
    assert.equal(at(positions, 'eng-design-intro').year, 1);
  });

  test('과목이 없는 학년은 빼고, 권장 학기가 null인 과목은 맨 오른쪽 "학기 미정" 묶음', () => {
    const positions = computePositions([
      makeCourse({ id: 'a', recommendedTerm: null }),
      makeCourse({ id: 'b', recommendedTerm: '3-2' }),
    ]);
    assert.deepEqual(positions.years.map((year) => year.label), ['3학년', '학기 미정']);
    assert.ok(at(positions, 'a').x > at(positions, 'b').x);
    assert.equal(at(positions, 'a').year, null);
  });

  test('자리가 없는 권장 학기 값은 오류로 알린다', () => {
    assert.throws(() => computePositions([makeCourse({ id: 'a', recommendedTerm: '5-1' })]), RangeError);
  });
});

// ---- 화살표 경로 검사 도우미 ----
function edgesOf(courses) {
  const edges = [];
  for (const course of courses) {
    for (const [relation, ids] of [
      ['hard', course.hardPrerequisiteIds ?? []],
      ['recommended', course.recommendedPreviousIds],
    ]) {
      for (const id of ids) edges.push({ id: `${relation}:${id}->${course.id}`, sourceId: id, targetId: course.id });
    }
  }
  return edges;
}

// 각 화살표를 [붙는 곳, 꺾이는 점…, 붙는 곳] 선분 목록으로
function segmentsOf(courses, dims) {
  const layout = computePositions(courses, dims);
  const edges = edgesOf(courses);
  const routes = routeEdges(edges, layout);
  const segments = [];
  for (const edge of edges) {
    const route = routes.get(edge.id);
    const source = layout.courses.get(edge.sourceId);
    const target = layout.courses.get(edge.targetId);
    const points = [
      { x: source.x + route.sourcePort.x, y: source.y + route.sourcePort.y },
      ...route.points,
      { x: target.x + route.targetPort.x, y: target.y + route.targetPort.y },
    ];
    for (let i = 1; i < points.length; i += 1) segments.push({ edge, a: points[i - 1], b: points[i] });
  }
  return { layout, edges, routes, segments };
}

const span = (p, q) => [Math.min(p, q), Math.max(p, q)];
const overlapLength = ([a1, a2], [b1, b2]) => Math.min(a2, b2) - Math.max(a1, b1);

function overlappingPairs(segments) {
  const pairs = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const [p, q] = [segments[i], segments[j]];
      if (p.edge.id === q.edge.id) continue;
      const bothHorizontal = p.a.y === p.b.y && q.a.y === q.b.y && Math.abs(p.a.y - q.a.y) < 3;
      const bothVertical = p.a.x === p.b.x && q.a.x === q.b.x && Math.abs(p.a.x - q.a.x) < 3;
      if (bothHorizontal && overlapLength(span(p.a.x, p.b.x), span(q.a.x, q.b.x)) > 1) pairs.push(`${p.edge.id} = ${q.edge.id}`);
      if (bothVertical && overlapLength(span(p.a.y, p.b.y), span(q.a.y, q.b.y)) > 1) pairs.push(`${p.edge.id} = ${q.edge.id}`);
    }
  }
  return pairs;
}

describe('routeEdges (화살표 길 찾기)', () => {
  const real = segmentsOf(loadRealCurriculum().courses);

  test('실제 데이터: 모든 선분이 가로 또는 세로다 (대각선 없음)', () => {
    for (const { edge, a, b } of real.segments) assert.ok(a.x === b.x || a.y === b.y, edge.id);
  });

  test('실제 데이터: 화살표끼리 같은 선 위에 겹치는 곳이 없다', () => {
    assert.deepEqual(overlappingPairs(real.segments), []);
  });

  test('실제 데이터: 화살표가 출발·도착 과목이 아닌 과목 상자를 지나가지 않는다', () => {
    for (const { edge, a, b } of real.segments) {
      for (const [id, box] of real.layout.courses) {
        if (id === edge.sourceId || id === edge.targetId) continue;
        const crossesX = overlapLength(span(a.x, b.x), [box.x - NODE_WIDTH / 2, box.x + NODE_WIDTH / 2]) > 0;
        const crossesY = overlapLength(span(a.y, b.y), [box.y - NODE_HEIGHT / 2, box.y + NODE_HEIGHT / 2]) >= 0;
        assert.ok(!(crossesX && crossesY), `${edge.id} → ${id}`);
      }
    }
  });

  test('넓은 화면에 맞춰 상자·간격을 늘려도 겹침·대각선이 없다', () => {
    const { courses } = loadRealCurriculum();
    for (const dims of [
      { nodeWidth: 230, columnWidth: 380, yearGap: 120 },
      { nodeWidth: 250, columnWidth: 430, yearGap: 130 },
    ]) {
      const { segments, layout } = segmentsOf(courses, dims);
      assert.equal(layout.dims.nodeWidth, dims.nodeWidth);
      assert.deepEqual(overlappingPairs(segments), [], JSON.stringify(dims));
      for (const { edge, a, b } of segments) assert.ok(a.x === b.x || a.y === b.y, edge.id);
    }
  });

  test('한 과목에 붙는 화살표가 여러 개면 붙는 높이를 서로 다르게 나눈다', () => {
    const { routes } = segmentsOf([
      makeCourse({ id: 'a', recommendedTerm: '1-1' }),
      makeCourse({ id: 'b', recommendedTerm: '1-1' }),
      makeCourse({ id: 'c', recommendedTerm: '1-2', recommendedPreviousIds: ['a', 'b'] }),
    ]);
    const ys = [...routes.values()].map((route) => route.targetPort.y);
    assert.equal(new Set(ys).size, 2);
    for (const y of ys) assert.ok(Math.abs(y) < NODE_HEIGHT / 2);
  });

  test('같은 칸을 지나는 세로선은 서로 다른 x로 나란히 놓는다', () => {
    // a·b(1-1) → c·d(1-2): 네 화살표가 같은 빈칸을 위아래로 지나감
    const courses = [
      makeCourse({ id: 'a', recommendedTerm: '1-1' }),
      makeCourse({ id: 'b', recommendedTerm: '1-1' }),
      makeCourse({ id: 'c', recommendedTerm: '1-2', recommendedPreviousIds: ['b'] }),
      makeCourse({ id: 'd', recommendedTerm: '1-2', recommendedPreviousIds: ['a'] }),
    ];
    assert.deepEqual(overlappingPairs(segmentsOf(courses).segments), []);
  });

  test('사이에 칸이 있는 긴 화살표 여러 개는 행 사이 틈에서 서로 다른 높이로 지나간다', () => {
    const courses = [
      makeCourse({ id: 'a', recommendedTerm: '1-1' }),
      makeCourse({ id: 'b', recommendedTerm: '1-1' }),
      makeCourse({ id: 'mid', recommendedTerm: '1-2' }),
      makeCourse({ id: 'c', recommendedTerm: '2-1', recommendedPreviousIds: ['a', 'b'] }),
    ];
    const { segments, routes } = segmentsOf(courses);
    assert.deepEqual(overlappingPairs(segments), []);
    const laneYs = [...routes.values()].map((route) => route.points[1].y);
    assert.equal(new Set(laneYs).size, 2);
  });

  test('같은 칸 안의 과목끼리 이어지면 오른쪽 통로로 돌아 뒤 과목 오른쪽에 붙는다', () => {
    const { routes, segments } = segmentsOf([
      makeCourse({ id: 'a', recommendedTerm: '3-2' }),
      makeCourse({ id: 'b', recommendedTerm: '3-2', recommendedPreviousIds: ['a'] }),
    ]);
    const route = [...routes.values()][0];
    assert.equal(route.targetPort.x, NODE_WIDTH / 2);
    for (const { a, b } of segments) assert.ok(a.x === b.x || a.y === b.y);
  });
});

describe('로드맵 화면 파일 제공', () => {
  let server;
  let url;
  before(async () => {
    server = createApp({ logger: { error() {} } }).listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    url = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  test('GET /roadmap/ 은 로드맵 화면을 반환한다', async () => {
    const response = await fetch(`${url}/roadmap/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /전공 로드맵/);
  });

  test('화면에서 쓰는 /shared/curriculum/graph.js 를 JavaScript로 제공한다', async () => {
    const response = await fetch(`${url}/shared/curriculum/graph.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
  });
});
