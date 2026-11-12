// 과목 선후수 관계 그래프와 탐색 함수 (화면과 분리된 순수 함수)
//
// 관계 종류 (docs/CONTRACT_CHECKLIST.md 2절)
//   - hard: hardPrerequisiteIds — 공식 필수 선수 (이수체계도 빨간 화살표)
//   - recommended: recommendedPreviousIds — 권장 선행 (검은 화살표)
// linkedCourseIds(설계↔실습)는 순서가 없는 관계라 그래프에 넣지 않습니다.

export const RELATIONS = ['hard', 'recommended'];

const FIELD_OF = {
  hard: 'hardPrerequisiteIds',
  recommended: 'recommendedPreviousIds',
};

/**
 * 과목 배열로 선후수 그래프를 만듭니다.
 * - previous: 과목 → 바로 앞 과목들 [{ courseId, relation }]
 * - next: 과목 → 바로 뒤 과목들 [{ courseId, relation }]
 * - unknownHardIds: hardPrerequisiteIds가 null(아직 확인 못 함)인 과목
 * 교육과정에 없는 과목을 가리키는 관계는 건너뜁니다. (그런 데이터는 validateCurriculum이 잡습니다.)
 */
export function buildCourseGraph(courses) {
  const courseIds = new Set(courses.map((course) => course.id));
  const previous = new Map();
  const next = new Map();
  const unknownHardIds = new Set();

  for (const id of courseIds) {
    previous.set(id, []);
    next.set(id, []);
  }

  for (const course of courses) {
    if (course.hardPrerequisiteIds === null) unknownHardIds.add(course.id);

    for (const relation of RELATIONS) {
      for (const previousId of course[FIELD_OF[relation]] ?? []) {
        if (!courseIds.has(previousId) || previousId === course.id) continue;
        previous.get(course.id).push({ courseId: previousId, relation });
        next.get(previousId).push({ courseId: course.id, relation });
      }
    }
  }

  return { courseIds, previous, next, unknownHardIds };
}

function normalizeRelations(relations) {
  const list = relations ?? RELATIONS;
  for (const relation of list) {
    if (!RELATIONS.includes(relation)) throw new TypeError(`알 수 없는 관계 종류: ${relation}`);
  }
  return new Set(list);
}

// BFS: 시작 과목에서 한 방향으로 퍼져 나가며 가까운 과목부터 찾습니다.
// depth는 시작 과목에서 몇 단계 떨어져 있는지(최단 거리)입니다.
function breadthFirst(graph, startId, adjacency, relations) {
  const depthOf = new Map([[startId, 0]]);
  const order = [];
  const edges = [];
  const queue = [startId];

  for (let head = 0; head < queue.length; head += 1) {
    const currentId = queue[head];
    for (const { courseId, relation } of adjacency.get(currentId)) {
      if (!relations.has(relation)) continue;
      edges.push({ fromId: currentId, toId: courseId, relation });
      if (depthOf.has(courseId)) continue;
      depthOf.set(courseId, depthOf.get(currentId) + 1);
      order.push(courseId);
      queue.push(courseId);
    }
  }

  return {
    courses: order.map((courseId) => ({ courseId, depth: depthOf.get(courseId) })),
    edges,
  };
}

/**
 * 이 과목을 듣기 전에 거쳐야 하는 모든 선행 과목 (직접 + 간접).
 * - courses: [{ courseId, depth }] 가까운 과목부터, 시작 과목은 빼고
 * - edges: [{ fromId, toId, relation }] 탐색하며 지난 관계 (fromId가 뒤 과목, toId가 앞 과목)
 * - unknownCourseIds: 시작 과목 또는 찾은 선행 과목 중 필수 선수가 아직 확인되지 않은(null) 과목.
 *   이 과목들 앞에는 아직 모르는 필수 선수가 더 있을 수 있습니다.
 * 없는 과목 ID면 null을 반환합니다.
 */
export function findPrerequisites(graph, courseId, { relations } = {}) {
  if (!graph.courseIds.has(courseId)) return null;
  const relationSet = normalizeRelations(relations);
  const result = breadthFirst(graph, courseId, graph.previous, relationSet);

  const unknownCourseIds = relationSet.has('hard')
    ? [courseId, ...result.courses.map((item) => item.courseId)].filter((id) => graph.unknownHardIds.has(id))
    : [];

  return { ...result, unknownCourseIds };
}

/**
 * 이 과목을 들은 뒤 이어서 들을 수 있는 모든 후속 과목 (직접 + 간접).
 * - courses: [{ courseId, depth }] 가까운 과목부터, 시작 과목은 빼고
 * - edges: [{ fromId, toId, relation }] (fromId가 앞 과목, toId가 뒤 과목)
 * 필수 선수가 null인 과목은 이 과목을 필요로 하는지 아직 모르므로 결과에 나오지 않을 수 있습니다.
 * 없는 과목 ID면 null을 반환합니다.
 */
export function findFollowUps(graph, courseId, { relations } = {}) {
  if (!graph.courseIds.has(courseId)) return null;
  return breadthFirst(graph, courseId, graph.next, normalizeRelations(relations));
}

/**
 * DFS로 선후수 관계에 순환(A → B → … → A)이 있는지 찾습니다.
 * 순환이 있으면 [A, B, …, A] 형태의 과목 ID 배열, 없으면 null.
 */
export function findCycle(graph, { relations } = {}) {
  const relationSet = normalizeRelations(relations);
  const VISITING = 1;
  const DONE = 2;
  const state = new Map();
  const path = [];

  function visit(id) {
    state.set(id, VISITING);
    path.push(id);

    for (const { courseId, relation } of graph.next.get(id)) {
      if (!relationSet.has(relation)) continue;
      if (state.get(courseId) === VISITING) {
        return [...path.slice(path.indexOf(courseId)), courseId];
      }
      if (!state.has(courseId)) {
        const cycle = visit(courseId);
        if (cycle) return cycle;
      }
    }

    path.pop();
    state.set(id, DONE);
    return null;
  }

  for (const id of graph.courseIds) {
    if (state.has(id)) continue;
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}
