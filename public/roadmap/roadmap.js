// 전공 로드맵 화면: 교육과정을 불러와 Cytoscape 그래프로 그리고, 과목 선택·트랙 필터를 처리합니다.
import { buildCourseGraph, findFollowUps, findPrerequisites } from '/shared/curriculum/graph.js';
import { computePositions } from '/roadmap/positions.js';

const CYTOSCAPE_URL = 'https://cdn.jsdelivr.net/npm/cytoscape@3.30.2/dist/cytoscape.esm.min.mjs';
const DEPARTMENT_ID = 'ce';

const CATEGORY_LABELS = {
  major_required: '전공필수',
  major_elective: '전공선택',
  general_required: '교양필수',
  general_elective: '교양선택',
  foundation_required: '기초필수',
  foundation_elective: '기초선택',
  free_elective: '자유선택',
  unknown: '확인 필요',
};

const TAG_LABELS = {
  'bigdata-ai': '빅데이터 및 인공지능',
  'semiconductor-iot': '반도체 및 IoT',
  'hw-sw-convergence': 'HW/SW 융복합',
};

const OFFERED_LABELS = { 1: '1학기', 2: '2학기', S: '여름학기', W: '겨울학기' };

const elements = {
  source: document.getElementById('roadmap-source'),
  filter: document.getElementById('track-filter'),
  select: document.getElementById('course-select'),
  graph: document.getElementById('roadmap-graph'),
  status: document.getElementById('roadmap-status'),
  detail: document.getElementById('course-detail'),
};

const state = { curriculum: null, courseById: new Map(), graph: null, cy: null, track: 'all', selectedId: null };

function showStatus(message) {
  elements.status.hidden = false;
  elements.status.textContent = message;
}

// styles.css의 디자인 토큰 값을 읽어 그래프 색으로 씁니다. (색을 직접 쓰지 않기 위함)
function readTokens() {
  const style = getComputedStyle(document.documentElement);
  const token = (name) => style.getPropertyValue(name).trim();
  return {
    surface: token('--color-surface'),
    ink: token('--color-ink'),
    muted: token('--color-ink-muted'),
    line: token('--color-line'),
    accent: token('--color-accent'),
    accentSoft: token('--color-accent-soft'),
    accentInk: token('--color-accent-ink'),
    error: token('--color-error'),
    font: token('--font-sans'),
  };
}

function graphStyle(color) {
  return [
    {
      selector: 'node.course',
      style: {
        shape: 'round-rectangle',
        width: 150,
        height: 44,
        'background-color': color.surface,
        'border-width': 1,
        'border-color': color.line,
        label: 'data(label)',
        color: color.ink,
        'font-family': color.font,
        'font-size': 13,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': 138,
      },
    },
    {
      selector: 'node.course[category = "major_required"]',
      style: { 'background-color': color.accentSoft, 'border-color': color.accent, 'border-width': 2, 'font-weight': 700 },
    },
    {
      selector: 'node.term',
      style: {
        shape: 'rectangle',
        width: 150,
        height: 24,
        'background-opacity': 0,
        label: 'data(label)',
        color: color.muted,
        'font-family': color.font,
        'font-size': 13,
        'font-weight': 700,
        'text-valign': 'center',
        events: 'no',
      },
    },
    {
      selector: 'edge',
      style: {
        width: 1.5,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        'line-color': color.line,
        'target-arrow-color': color.line,
      },
    },
    {
      selector: 'edge[relation = "recommended"]',
      style: { 'line-style': 'dashed', 'line-color': color.muted, 'target-arrow-color': color.muted, opacity: 0.55 },
    },
    {
      selector: 'edge[relation = "hard"]',
      style: { width: 2.5, 'line-color': color.error, 'target-arrow-color': color.error },
    },
    { selector: '.is-faded', style: { opacity: 0.15 } },
    {
      selector: 'node.is-selected',
      style: { 'background-color': color.accent, 'border-color': color.accent, color: color.accentInk, 'border-width': 2 },
    },
    { selector: 'node.is-related', style: { 'border-color': color.accent, 'border-width': 3, opacity: 1 } },
    { selector: 'edge.is-path', style: { opacity: 1, width: 3, 'z-index': 10 } },
    {
      selector: 'edge.is-path[relation = "recommended"]',
      style: { 'line-color': color.accent, 'target-arrow-color': color.accent },
    },
  ];
}

function buildElements(curriculum, positions) {
  const nodes = positions.columns.map((column) => ({
    group: 'nodes',
    classes: 'term',
    data: { id: `term:${column.term ?? 'none'}`, label: column.label },
    position: { x: column.x, y: column.y },
    selectable: false,
    grabbable: false,
  }));

  for (const course of curriculum.courses) {
    nodes.push({
      group: 'nodes',
      classes: 'course',
      data: { id: course.id, label: course.name, category: course.category },
      position: positions.courses.get(course.id),
      grabbable: false,
    });
  }

  // 화살표 방향: 앞 과목 → 뒤 과목
  const edges = [];
  for (const [courseId, previousList] of state.graph.previous) {
    for (const { courseId: previousId, relation } of previousList) {
      edges.push({
        group: 'edges',
        data: { id: `${relation}:${previousId}->${courseId}`, source: previousId, target: courseId, relation },
      });
    }
  }

  return [...nodes, ...edges];
}

function edgeId({ fromId, toId, relation }, direction) {
  return direction === 'prerequisites' ? `${relation}:${toId}->${fromId}` : `${relation}:${fromId}->${toId}`;
}

function inTrack(course) {
  return state.track === 'all' || course.tags.includes(state.track);
}

// 트랙 필터와 선택 과목에 맞춰 노드·화살표 강조를 다시 칠합니다.
function paint() {
  const { cy, selectedId } = state;
  cy.batch(() => {
    cy.elements().removeClass('is-faded is-selected is-related is-path');

    if (!selectedId) {
      cy.nodes('.course').forEach((node) => {
        if (!inTrack(state.courseById.get(node.id()))) node.addClass('is-faded');
      });
      cy.edges().forEach((edge) => {
        if (edge.source().hasClass('is-faded') || edge.target().hasClass('is-faded')) edge.addClass('is-faded');
      });
      return;
    }

    const prerequisites = findPrerequisites(state.graph, selectedId);
    const followUps = findFollowUps(state.graph, selectedId);
    const related = new Set([...prerequisites.courses, ...followUps.courses].map((item) => item.courseId));
    const pathEdges = new Set([
      ...prerequisites.edges.map((edge) => edgeId(edge, 'prerequisites')),
      ...followUps.edges.map((edge) => edgeId(edge, 'followUps')),
    ]);

    cy.nodes('.course').forEach((node) => {
      if (node.id() === selectedId) node.addClass('is-selected');
      else if (related.has(node.id())) node.addClass('is-related');
      else node.addClass('is-faded');
    });
    cy.edges().forEach((edge) => edge.addClass(pathEdges.has(edge.id()) ? 'is-path' : 'is-faded'));
  });
}

function courseButton(courseId) {
  const course = state.courseById.get(courseId);
  return `<li><button type="button" class="course-detail__link" data-course-id="${course.id}">${course.name}</button></li>`;
}

function courseList(ids, emptyText) {
  if (ids.length === 0) return `<p class="course-detail__none">${emptyText}</p>`;
  return `<ul class="course-detail__list">${ids.map(courseButton).join('')}</ul>`;
}

function renderDetail() {
  const course = state.courseById.get(state.selectedId);
  if (!course) {
    elements.detail.innerHTML = '<p class="course-detail__empty">과목을 선택하면 자세한 정보가 여기에 나옵니다.</p>';
    return;
  }

  const prerequisites = findPrerequisites(state.graph, course.id);
  const followUps = findFollowUps(state.graph, course.id);
  const directNext = state.graph.next.get(course.id).map((item) => item.courseId);
  const isRequired = course.category === 'major_required';

  const hardHtml =
    course.hardPrerequisiteIds === null
      ? '<p class="course-detail__none course-detail__none--warn">공식 자료에서 아직 확인하지 못했습니다.</p>'
      : courseList(course.hardPrerequisiteIds, '없음');

  const unknownNote =
    prerequisites.unknownCourseIds.length > 0
      ? `<p class="course-detail__note">필수 선수가 확인되지 않은 과목이 있어(${prerequisites.unknownCourseIds
          .map((id) => state.courseById.get(id).name)
          .join(', ')}) 실제로는 더 많을 수 있습니다.</p>`
      : '';

  const offered = course.offeredTerms.map((term) => OFFERED_LABELS[term] ?? term).join(', ') || '확인 필요';
  const tags = course.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(', ') || '없음';

  elements.detail.innerHTML = `
    <header class="course-detail__head">
      <span class="type ${isRequired ? 'type--required' : 'type--elective'}">${CATEGORY_LABELS[course.category] ?? course.category}</span>
      <h2>${course.name}</h2>
      <button type="button" class="button button--quiet course-detail__clear" data-action="clear">선택 해제</button>
    </header>
    <dl class="course-detail__facts">
      <div><dt>학점</dt><dd>${course.credits}학점</dd></div>
      <div><dt>권장 학기</dt><dd>${course.recommendedTerm ?? '확인 필요'}</dd></div>
      <div><dt>개설 학기</dt><dd>${offered}</dd></div>
      <div><dt>진로 트랙</dt><dd>${tags}</dd></div>
    </dl>
    <section><h3>필수 선수 과목</h3>${hardHtml}</section>
    <section><h3>권장 선행 과목</h3>${courseList(course.recommendedPreviousIds, '없음')}</section>
    <section><h3>함께 들으면 좋은 과목</h3>${courseList(course.linkedCourseIds, '없음')}</section>
    <section><h3>바로 이어지는 과목</h3>${courseList(directNext, '없음')}</section>
    <p class="course-detail__summary">
      먼저 거쳐야 하는 과목 <strong>${prerequisites.courses.length}</strong>개 ·
      이어서 들을 수 있는 과목 <strong>${followUps.courses.length}</strong>개
    </p>
    ${unknownNote}`;
}

// reveal: 목록·상세 패널에서 고른 과목이 그래프 화면 밖에 있으면 그 과목이 가운데 오도록 옮깁니다. (움직임 없이 바로)
function select(courseId, { reveal = false } = {}) {
  state.selectedId = state.courseById.has(courseId) ? courseId : null;
  elements.select.value = state.selectedId ?? '';
  paint();
  renderDetail();

  if (reveal && state.selectedId) {
    const node = state.cy.getElementById(state.selectedId);
    const box = node.renderedBoundingBox();
    const outside = box.x1 < 0 || box.y1 < 0 || box.x2 > state.cy.width() || box.y2 > state.cy.height();
    if (outside) state.cy.center(node);
  }
}

function renderFilter() {
  const options = [{ id: 'all', label: '전체' }, ...state.curriculum.tags.map((tag) => ({ id: tag, label: TAG_LABELS[tag] ?? tag }))];
  elements.filter.innerHTML = options
    .map(
      (option) =>
        `<button type="button" class="chip" data-track="${option.id}" aria-pressed="${option.id === state.track}">${option.label}</button>`,
    )
    .join('');
}

function renderSelect() {
  const sorted = [...state.curriculum.courses].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  elements.select.innerHTML =
    '<option value="">과목을 고르세요</option>' +
    sorted.map((course) => `<option value="${course.id}">${course.name}</option>`).join('');
  elements.select.disabled = false;
}

function bindEvents() {
  state.cy.on('tap', 'node.course', (event) => {
    const id = event.target.id();
    select(state.selectedId === id ? null : id);
  });
  state.cy.on('tap', (event) => {
    if (event.target === state.cy) select(null);
  });
  state.cy.on('mouseover', 'node.course', () => elements.graph.classList.add('is-pointer'));
  state.cy.on('mouseout', 'node.course', () => elements.graph.classList.remove('is-pointer'));

  elements.select.addEventListener('change', () => select(elements.select.value || null, { reveal: true }));

  elements.filter.addEventListener('click', (event) => {
    const button = event.target.closest('[data-track]');
    if (!button) return;
    state.track = button.dataset.track;
    renderFilter();
    if (state.selectedId && !inTrack(state.courseById.get(state.selectedId))) state.selectedId = null;
    select(state.selectedId);
  });

  elements.detail.addEventListener('click', (event) => {
    const link = event.target.closest('[data-course-id]');
    if (link) select(link.dataset.courseId, { reveal: true });
    if (event.target.closest('[data-action="clear"]')) select(null);
  });

  window.addEventListener('resize', fitGraph);
}

// 화면이 좁아 전체를 맞추면 글자가 너무 작아질 때는, 읽을 수 있는 크기로 두고 왼쪽 위부터 보여 줍니다. (나머지는 드래그로 이동)
const MIN_READABLE_ZOOM = 0.75;
const GRAPH_PADDING = 24;

function fitGraph() {
  const { cy } = state;
  cy.resize();
  cy.fit(undefined, GRAPH_PADDING);
  if (cy.zoom() >= MIN_READABLE_ZOOM) return;

  cy.zoom(MIN_READABLE_ZOOM);
  const box = cy.elements().boundingBox();
  cy.pan({ x: GRAPH_PADDING - box.x1 * MIN_READABLE_ZOOM, y: GRAPH_PADDING - box.y1 * MIN_READABLE_ZOOM });
}

async function loadCurriculum() {
  const response = await fetch(`/api/curriculum/${DEPARTMENT_ID}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? '교육과정을 불러오지 못했습니다.');
  return body;
}

async function start() {
  let cytoscape;
  let curriculum;
  try {
    [{ default: cytoscape }, curriculum] = await Promise.all([import(CYTOSCAPE_URL), loadCurriculum()]);
  } catch (error) {
    showStatus(`로드맵을 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요. (${error.message})`);
    return;
  }

  state.curriculum = curriculum;
  state.courseById = new Map(curriculum.courses.map((course) => [course.id, course]));
  state.graph = buildCourseGraph(curriculum.courses);

  const sourceDate = curriculum.source?.verifiedAt ? ` · ${curriculum.source.verifiedAt} 확인` : '';
  elements.source.textContent = `${curriculum.department.name} ${curriculum.catalogYear}학년도 교육과정 기준${sourceDate}. 과목을 누르면 먼저 들어야 할 과목과 이어서 들을 과목이 표시됩니다.`;

  elements.status.hidden = true;
  state.cy = cytoscape({
    container: elements.graph,
    elements: buildElements(curriculum, computePositions(curriculum.courses)),
    style: graphStyle(readTokens()),
    layout: { name: 'preset', padding: 24 },
    minZoom: 0.3,
    maxZoom: 2,
    autoungrabify: true,
    boxSelectionEnabled: false,
  });

  renderFilter();
  renderSelect();
  bindEvents();
  fitGraph();
  paint();
}

start();
