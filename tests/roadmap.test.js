// 전공 로드맵 화면 (public/roadmap/)
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { COLUMN_WIDTH, computePositions, TERM_COLUMNS } from '../public/roadmap/positions.js';
import { RECOMMENDED_TERM_PATTERN } from '../shared/curriculum/schema.js';
import { createApp } from '../server/app.js';
import { loadRealCurriculum, makeCourse } from './helpers/curriculum.js';

describe('computePositions', () => {
  test('계약이 허용하는 모든 권장 학기(1-1 ~ 4-2)와 null에 칸이 있다', () => {
    const terms = TERM_COLUMNS.map((column) => column.term);
    assert.ok(terms.includes(null));
    for (const year of [1, 2, 3, 4]) {
      for (const semester of [1, 2]) {
        const term = `${year}-${semester}`;
        assert.match(term, RECOMMENDED_TERM_PATTERN);
        assert.ok(terms.includes(term), term);
      }
    }
  });

  test('실제 교육과정의 모든 과목에 좌표가 있고 서로 겹치지 않는다', () => {
    const { courses } = loadRealCurriculum();
    const positions = computePositions(courses).courses;
    assert.equal(positions.size, courses.length);
    const keys = new Set([...positions.values()].map(({ x, y }) => `${x},${y}`));
    assert.equal(keys.size, courses.length);
  });

  test('같은 학기 과목은 같은 칸, 학기가 늦을수록 오른쪽', () => {
    const { courses } = computePositions([
      makeCourse({ id: 'a', recommendedTerm: '2-1' }),
      makeCourse({ id: 'b', recommendedTerm: '1-1' }),
      makeCourse({ id: 'c', recommendedTerm: '2-1' }),
    ]);
    assert.equal(courses.get('a').x, courses.get('c').x);
    assert.ok(courses.get('a').y < courses.get('c').y);
    assert.ok(courses.get('b').x < courses.get('a').x);
  });

  test('과목이 없는 칸은 빼고 왼쪽부터 붙인다', () => {
    const { columns } = computePositions([makeCourse({ id: 'a', recommendedTerm: '3-2' })]);
    assert.deepEqual(columns, [{ term: '3-2', label: '3학년 2학기', x: 0, y: 0 }]);
  });

  test('권장 학기가 null인 과목은 "학기 미정" 칸(맨 왼쪽)', () => {
    const { courses, columns } = computePositions([
      makeCourse({ id: 'a', recommendedTerm: null }),
      makeCourse({ id: 'b', recommendedTerm: '1-1' }),
    ]);
    assert.equal(columns[0].label, '학기 미정');
    assert.equal(courses.get('a').x, 0);
    assert.equal(courses.get('b').x, COLUMN_WIDTH);
  });

  test('칸이 없는 권장 학기는 오류로 알린다', () => {
    assert.throws(() => computePositions([makeCourse({ id: 'a', recommendedTerm: '5-1' })]), RangeError);
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
