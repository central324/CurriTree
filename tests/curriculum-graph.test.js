// 과목 선후수 그래프 탐색 (shared/curriculum/graph.js)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildCourseGraph, findCycle, findFollowUps, findPrerequisites } from '../shared/curriculum/graph.js';
import { loadRealCurriculum, makeCourse } from './helpers/curriculum.js';

// a → b → d,  a → c (권장) → d,  e는 필수 선수 미확인(null)
function sampleGraph() {
  return buildCourseGraph([
    makeCourse({ id: 'a' }),
    makeCourse({ id: 'b', hardPrerequisiteIds: ['a'] }),
    makeCourse({ id: 'c', recommendedPreviousIds: ['a'] }),
    makeCourse({ id: 'd', hardPrerequisiteIds: ['b'], recommendedPreviousIds: ['c'] }),
    makeCourse({ id: 'e', hardPrerequisiteIds: null, recommendedPreviousIds: ['d'] }),
  ]);
}

const ids = (result) => result.courses.map((item) => item.courseId);

describe('buildCourseGraph', () => {
  test('앞·뒤 관계를 양쪽 방향으로 저장한다', () => {
    const graph = sampleGraph();
    assert.deepEqual(graph.previous.get('d'), [
      { courseId: 'b', relation: 'hard' },
      { courseId: 'c', relation: 'recommended' },
    ]);
    assert.deepEqual(graph.next.get('a'), [
      { courseId: 'b', relation: 'hard' },
      { courseId: 'c', relation: 'recommended' },
    ]);
  });

  test('필수 선수가 null인 과목을 따로 기록한다 ([]와 구분)', () => {
    const graph = sampleGraph();
    assert.deepEqual([...graph.unknownHardIds], ['e']);
  });

  test('연계 과목(linkedCourseIds)은 선후수 관계로 넣지 않는다', () => {
    const graph = buildCourseGraph([
      makeCourse({ id: 'design', linkedCourseIds: ['lab'] }),
      makeCourse({ id: 'lab', linkedCourseIds: ['design'] }),
    ]);
    assert.deepEqual(graph.previous.get('design'), []);
    assert.deepEqual(graph.next.get('design'), []);
  });

  test('교육과정에 없는 과목을 가리키는 관계와 자기 자신 관계는 건너뛴다', () => {
    const graph = buildCourseGraph([makeCourse({ id: 'a', hardPrerequisiteIds: ['ghost', 'a'] })]);
    assert.deepEqual(graph.previous.get('a'), []);
  });
});

describe('findPrerequisites (BFS)', () => {
  test('직접·간접 선행 과목을 가까운 순서로, 단계(depth)와 함께 반환한다', () => {
    const result = findPrerequisites(sampleGraph(), 'd');
    assert.deepEqual(result.courses, [
      { courseId: 'b', depth: 1 },
      { courseId: 'c', depth: 1 },
      { courseId: 'a', depth: 2 },
    ]);
  });

  test('두 경로로 만나는 과목은 한 번만, 최단 단계로 나온다', () => {
    const result = findPrerequisites(sampleGraph(), 'e');
    assert.deepEqual(ids(result), ['d', 'b', 'c', 'a']);
    assert.equal(result.courses.find((item) => item.courseId === 'a').depth, 3);
  });

  test('지나온 관계를 모두 edges로 돌려준다 (화면 강조용)', () => {
    const result = findPrerequisites(sampleGraph(), 'd');
    assert.deepEqual(result.edges, [
      { fromId: 'd', toId: 'b', relation: 'hard' },
      { fromId: 'd', toId: 'c', relation: 'recommended' },
      { fromId: 'b', toId: 'a', relation: 'hard' },
      { fromId: 'c', toId: 'a', relation: 'recommended' },
    ]);
  });

  test('relations로 필수 선수만 따라갈 수 있다', () => {
    const result = findPrerequisites(sampleGraph(), 'd', { relations: ['hard'] });
    assert.deepEqual(ids(result), ['b', 'a']);
  });

  test('필수 선수가 미확인(null)인 과목을 unknownCourseIds로 알려준다', () => {
    assert.deepEqual(findPrerequisites(sampleGraph(), 'e').unknownCourseIds, ['e']);
    assert.deepEqual(findPrerequisites(sampleGraph(), 'd').unknownCourseIds, []);
    assert.deepEqual(findPrerequisites(sampleGraph(), 'e', { relations: ['recommended'] }).unknownCourseIds, []);
  });

  test('선행 과목이 없으면 빈 배열', () => {
    const result = findPrerequisites(sampleGraph(), 'a');
    assert.deepEqual(result.courses, []);
    assert.deepEqual(result.edges, []);
  });

  test('없는 과목 ID면 null', () => {
    assert.equal(findPrerequisites(sampleGraph(), 'ghost'), null);
  });

  test('알 수 없는 관계 종류는 오류', () => {
    assert.throws(() => findPrerequisites(sampleGraph(), 'd', { relations: ['linked'] }), TypeError);
  });
});

describe('findFollowUps (BFS)', () => {
  test('직접·간접 후속 과목을 가까운 순서로 반환한다', () => {
    assert.deepEqual(findFollowUps(sampleGraph(), 'a').courses, [
      { courseId: 'b', depth: 1 },
      { courseId: 'c', depth: 1 },
      { courseId: 'd', depth: 2 },
      { courseId: 'e', depth: 3 },
    ]);
  });

  test('relations로 필수 선수 관계만 따라갈 수 있다', () => {
    assert.deepEqual(ids(findFollowUps(sampleGraph(), 'a', { relations: ['hard'] })), ['b', 'd']);
  });

  test('후속 과목이 없으면 빈 배열, 없는 과목 ID면 null', () => {
    assert.deepEqual(findFollowUps(sampleGraph(), 'e').courses, []);
    assert.equal(findFollowUps(sampleGraph(), 'ghost'), null);
  });
});

describe('findCycle (DFS)', () => {
  test('순환이 없으면 null', () => {
    assert.equal(findCycle(sampleGraph()), null);
  });

  test('순환이 있으면 경로를 반환한다', () => {
    const graph = buildCourseGraph([
      makeCourse({ id: 'x', hardPrerequisiteIds: ['z'] }),
      makeCourse({ id: 'y', hardPrerequisiteIds: ['x'] }),
      makeCourse({ id: 'z', recommendedPreviousIds: ['y'] }),
    ]);
    assert.deepEqual(findCycle(graph), ['x', 'y', 'z', 'x']);
    assert.equal(findCycle(graph, { relations: ['hard'] }), null);
  });
});

describe('실제 교육과정 데이터 (ce-2023)', () => {
  const data = loadRealCurriculum();
  const graph = buildCourseGraph(data.courses);

  test('선후수 관계에 순환이 없다', () => {
    assert.equal(findCycle(graph), null);
  });

  test('이수체계도 필수 선후수: 공학설계입문 → 객체지향프로그래밍설계 → 산학협력캡스톤설계1', () => {
    const result = findPrerequisites(graph, 'capstone-1', { relations: ['hard'] });
    assert.deepEqual(result.courses, [
      { courseId: 'oop-design', depth: 1 },
      { courseId: 'eng-design-intro', depth: 2 },
    ]);
  });

  test('머신러닝의 선행 과목에 알고리즘·인공지능·데이터구조설계가 있다', () => {
    const found = ids(findPrerequisites(graph, 'machine-learning'));
    for (const id of ['algorithms', 'artificial-intelligence', 'data-structure-design', 'oop-design']) {
      assert.ok(found.includes(id), id);
    }
  });

  test('산학협력캡스톤설계2는 필수 선수가 미확인이라 unknownCourseIds에 나온다', () => {
    assert.ok(findPrerequisites(graph, 'capstone-2').unknownCourseIds.includes('capstone-2'));
  });

  test('디지털논리회로1의 후속 과목에 디지털논리회로2·컴퓨터구조가 있다', () => {
    const found = ids(findFollowUps(graph, 'digital-logic-1'));
    assert.ok(found.includes('digital-logic-2'));
    assert.ok(found.includes('computer-architecture'));
  });
});
