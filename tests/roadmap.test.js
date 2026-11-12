// 전공 로드맵 화면 (public/roadmap/)
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { computePositions, NODE_HEIGHT, NODE_WIDTH, routeEdge } from '../public/roadmap/positions.js';
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

describe('routeEdge (직각 화살표)', () => {
  const positions = computePositions([
    makeCourse({ id: 'a', recommendedTerm: '1-1' }),
    makeCourse({ id: 'b', recommendedTerm: '1-2' }),
    makeCourse({ id: 'c', recommendedTerm: '2-1' }),
    makeCourse({ id: 'c2', recommendedTerm: '2-1' }),
    makeCourse({ id: 'd', recommendedTerm: '2-2' }),
    makeCourse({ id: 'd2', recommendedTerm: '2-2' }),
  ]);
  const route = (from, to) => routeEdge(at(positions, from), at(positions, to), positions.columns);

  // 시작 → 꺾이는 점들 → 끝 이 모두 가로 또는 세로 선분인지
  function assertOrthogonal(from, to) {
    const points = [at(positions, from), ...route(from, to), at(positions, to)];
    for (let i = 1; i < points.length; i += 1) {
      const horizontal = points[i].y === points[i - 1].y;
      const vertical = points[i].x === points[i - 1].x;
      assert.ok(horizontal || vertical, `${from}→${to} ${i}번째 선분`);
    }
  }

  test('같은 행의 바로 다음 칸이면 꺾지 않는다', () => {
    assert.deepEqual(route('a', 'b'), []);
  });

  test('다른 행의 바로 다음 칸이면 두 과목 사이 빈칸에서 한 번 세로로 꺾는다', () => {
    const points = route('b', 'c2');
    assert.equal(points.length, 2);
    const gapLeft = at(positions, 'b').x + NODE_WIDTH / 2;
    const gapRight = at(positions, 'c2').x - NODE_WIDTH / 2;
    assert.ok(points[0].x > gapLeft && points[0].x < gapRight);
    assertOrthogonal('b', 'c2');
  });

  test('사이에 칸이 있으면 과목을 가로지르지 않고 행 사이 틈으로 돌아간다', () => {
    const points = route('a', 'd2');
    assert.equal(points.length, 4);
    assertOrthogonal('a', 'd2');

    // 가로로 지나가는 선(틈)은 사이 칸 과목 상자들과 겹치지 않음
    const laneY = points[1].y;
    for (const id of ['b', 'c', 'c2']) {
      const box = at(positions, id);
      assert.ok(Math.abs(laneY - box.y) >= NODE_HEIGHT / 2, id);
    }
    // 세로선은 칸 사이 빈칸에 있음
    for (const point of points) {
      for (const x of positions.columns) assert.ok(Math.abs(point.x - x) > NODE_WIDTH / 2);
    }
  });

  test('실제 데이터의 모든 화살표가 가로·세로 선분으로만 이루어진다', () => {
    const { courses } = loadRealCurriculum();
    const real = computePositions(courses);
    for (const course of courses) {
      for (const previousId of [...(course.hardPrerequisiteIds ?? []), ...course.recommendedPreviousIds]) {
        const source = real.courses.get(previousId);
        const target = real.courses.get(course.id);
        const points = [source, ...routeEdge(source, target, real.columns), target];
        for (let i = 1; i < points.length; i += 1) {
          assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y, `${previousId}→${course.id}`);
        }
      }
    }
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
