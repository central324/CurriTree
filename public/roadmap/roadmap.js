// 전공 로드맵 화면: 교육과정을 불러와 Cytoscape 그래프로 그리고, 과목 클릭·트랙 필터를 처리합니다.
import { buildCourseGraph, findFollowUps, findPrerequisites } from '/shared/curriculum/graph.js';
import { escapeHtml, formatOfferedTerms } from '/roadmap/html.js';
import { computePositions, countColumns, routeEdges } from '/roadmap/positions.js';
import { fitColumns, isEdgeShown, SECTION_PADDING } from '/roadmap/view-rules.js';

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
  filter: document.getElementById('track-filter'),
  stage: document.getElementById('roadmap-stage'),
  legend: document.getElementById('roadmap-legend'),
  scroller: document.getElementById('roadmap-scroller'),
  graph: document.getElementById('roadmap-graph'),
  status: document.getElementById('roadmap-status'),
  dock: document.getElementById('course-dock'),
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
  const token = (name) => style.getPropertyValue(name).replace(/\s+/g, ' ').trim(); // 여러 줄 값(글꼴)도 한 줄로
  return {
    bg: token('--color-bg'),
    surface: token('--color-surface'),
    ink: token('--color-ink'),
    muted: token('--color-ink-muted'),
    line: token('--color-line'),
    lineSoft: token('--color-line-soft'),
    accent: token('--color-accent'),
    accentSoft: token('--color-accent-soft'),
    accentInk: token('--color-accent-ink'),
    error: token('--color-error'),
    font: token('--font-sans').replace(/['"]/g, ''), // Cytoscape는 따옴표 있는 글꼴 이름을 받지 않음
  };
}

// 동작 줄이기를 켠 사용자에게는 애니메이션 없이 바로 바뀌게 합니다.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const HIGHLIGHT_MS = 320; // 과목을 눌렀을 때 강조가 자연스럽게 바뀌는 시간 (Cytoscape는 밀리초 단위)

function graphStyle(color) {
  const duration = reducedMotion.matches ? 0 : HIGHLIGHT_MS;
  const transition = (properties) => ({
    'transition-property': properties,
    'transition-duration': duration,
    'transition-timing-function': 'ease-in-out-sine',
  });

  return [
    {
      selector: 'node.course',
      style: {
        shape: 'round-rectangle',
        width: 'data(w)',
        height: 'data(h)',
        'background-color': color.surface,
        'border-width': 1,
        'border-color': color.line,
        label: 'data(label)',
        color: color.ink,
        'font-family': color.font,
        'font-size': 17,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-overflow-wrap': 'anywhere', // 띄어쓰기 없는 긴 과목명도 상자 안에서 줄바꿈
        'text-max-width': 'data(textWidth)',
        ...transition('opacity, background-color, border-color, border-width, color'),
      },
    },
    {
      selector: 'node.course[category = "major_required"]',
      style: { 'background-color': color.accentSoft, 'border-color': color.accent, 'border-width': 2, 'font-weight': 700 },
    },
    {
      // 학년 묶음 상자 (안의 과목에 맞춰 크기가 자동으로 정해짐)
      selector: 'node.year',
      style: {
        shape: 'round-rectangle',
        'background-color': color.bg,
        'border-width': 1,
        'border-color': color.lineSoft,
        padding: SECTION_PADDING,
        label: 'data(label)',
        color: color.accent,
        'font-family': color.font,
        'font-size': 22,
        'font-weight': 800,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -10,
        events: 'no',
      },
    },
    {
      selector: 'node.term',
      style: {
        shape: 'rectangle',
        width: 'data(w)',
        height: 24,
        'background-opacity': 0,
        label: 'data(label)',
        color: color.muted,
        'font-family': color.font,
        'font-size': 16,
        'font-weight': 700,
        'text-valign': 'center',
        events: 'no',
      },
    },
    {
      // 학년 섹션 높이를 모두 같게 맞추려고 맨 아래 행에 두는 보이지 않는 점
      selector: 'node.spacer',
      style: { width: 'data(w)', height: 1, opacity: 0, events: 'no' },
    },
    {
      // 화살표는 가로·세로 직선으로만. 붙는 곳(포트)과 꺾이는 점은 positions.js의 routeEdges가 정합니다.
      selector: 'edge',
      style: {
        width: 1.5,
        'source-endpoint': 'data(sourceEndpoint)',
        'target-endpoint': 'data(targetEndpoint)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.9,
        'line-color': color.line,
        'target-arrow-color': color.line,
        ...transition('opacity, line-color, target-arrow-color, width'),
      },
    },
    { selector: 'edge.straight', style: { 'curve-style': 'straight' } },
    {
      selector: 'edge.bent',
      style: {
        'curve-style': 'segments',
        'edge-distances': 'node-position',
        'segment-weights': 'data(weights)',
        'segment-distances': 'data(distances)',
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
    // 권장 선행 점선은 기본으로 숨기고, 과목을 고르면 그 과목 경로의 점선만 나타남 (view-rules.js의 isEdgeShown)
    { selector: 'edge.is-hidden', style: { opacity: 0, events: 'no' } },
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

// Cytoscape의 segments 선은 꺾이는 점을 "시작→끝 직선 위 비율(weight) + 직선에서 떨어진 거리(distance)"로 받습니다.
function toSegmentData(source, target, points) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.hypot(dx, dy);
  const weights = [];
  const distances = [];
  for (const point of points) {
    const px = point.x - source.x;
    const py = point.y - source.y;
    weights.push((px * dx + py * dy) / (length * length));
    distances.push((py * dx - px * dy) / length);
  }
  return { weights, distances };
}

function buildElements(curriculum, positions) {
  const parentOf = (year) => (year === null ? 'year:none' : `year:${year}`);

  const nodes = positions.years.flatMap((year) => [
    { group: 'nodes', classes: 'year', data: { id: year.id, label: year.label }, selectable: false },
    {
      group: 'nodes',
      classes: 'spacer',
      data: { id: `${year.id}:spacer`, parent: year.id, w: positions.dims.nodeWidth },
      position: { x: year.x, y: positions.lastRowY + positions.dims.nodeHeight / 2 },
      selectable: false,
    },
  ]);

  for (const header of positions.headers) {
    nodes.push({
      group: 'nodes',
      classes: 'term',
      data: { id: header.id, label: header.label, parent: parentOf(header.year), w: positions.dims.nodeWidth },
      position: { x: header.x, y: header.y },
      selectable: false,
    });
  }

  for (const course of curriculum.courses) {
    const { x, y, year, wholeYear } = positions.courses.get(course.id);
    nodes.push({
      group: 'nodes',
      classes: 'course',
      data: {
        id: course.id,
        label: wholeYear ? `${course.name}\n(학기 미지정)` : course.name,
        category: course.category,
        parent: parentOf(year),
        w: positions.dims.nodeWidth,
        h: positions.dims.nodeHeight,
        textWidth: positions.dims.nodeWidth - 16,
      },
      position: { x, y },
    });
  }

  // 화살표 방향: 앞 과목 → 뒤 과목. 경로(붙는 곳·꺾이는 점)는 routeEdges가 한꺼번에 정해 서로 겹치지 않게 합니다.
  const edgeList = [];
  for (const [courseId, previousList] of state.graph.previous) {
    for (const { courseId: previousId, relation } of previousList) {
      edgeList.push({ id: `${relation}:${previousId}->${courseId}`, sourceId: previousId, targetId: courseId, relation });
    }
  }
  const routes = routeEdges(edgeList, positions);

  const edges = edgeList.map(({ id, sourceId, targetId, relation }) => {
    const { sourcePort, targetPort, points } = routes.get(id);
    const source = positions.courses.get(sourceId);
    const target = positions.courses.get(targetId);
    return {
      group: 'edges',
      // 처음부터 숨길 선은 숨긴 채로 추가 (보였다가 사라지는 전환이 생기지 않게)
      classes: `${points.length === 0 ? 'straight' : 'bent'}${isEdgeShown(relation, false) ? '' : ' is-hidden'}`,
      data: {
        id,
        source: sourceId,
        target: targetId,
        relation,
        sourceEndpoint: `${sourcePort.x}px ${sourcePort.y}px`,
        targetEndpoint: `${targetPort.x}px ${targetPort.y}px`,
        ...toSegmentData(source, target, points),
      },
    };
  });

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
    cy.elements().removeClass('is-faded is-selected is-related is-path is-hidden');

    if (!selectedId) {
      cy.nodes('.course').forEach((node) => {
        if (!inTrack(state.courseById.get(node.id()))) node.addClass('is-faded');
      });
      cy.edges().forEach((edge) => {
        if (!isEdgeShown(edge.data('relation'), false)) edge.addClass('is-hidden');
        else if (edge.source().hasClass('is-faded') || edge.target().hasClass('is-faded')) edge.addClass('is-faded');
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
    cy.edges().forEach((edge) => {
      const onPath = pathEdges.has(edge.id());
      if (!isEdgeShown(edge.data('relation'), onPath)) edge.addClass('is-hidden');
      else edge.addClass(onPath ? 'is-path' : 'is-faded');
    });
  });
}

function courseButton(courseId) {
  const course = state.courseById.get(courseId);
  return `<li><button type="button" class="course-detail__link" data-course-id="${escapeHtml(course.id)}">${escapeHtml(course.name)}</button></li>`;
}

function courseList(ids, emptyText) {
  if (ids.length === 0) return `<p class="course-detail__none">${emptyText}</p>`;
  return `<ul class="course-detail__list">${ids.map(courseButton).join('')}</ul>`;
}

function renderDetail() {
  const course = state.courseById.get(state.selectedId);
  if (!course) {
    elements.detail.innerHTML = GUIDE_HTML;
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
          .map((id) => escapeHtml(state.courseById.get(id).name))
          .join(', ')}) 실제로는 더 많을 수 있습니다.</p>`
      : '';

  const offered = escapeHtml(formatOfferedTerms(course.offeredTerms, OFFERED_LABELS));
  const tags = escapeHtml(course.tags.map((tag) => TAG_LABELS[tag] ?? tag).join(', ') || '없음');

  elements.detail.innerHTML = `
    <header class="course-detail__head">
      <span class="type ${isRequired ? 'type--required' : 'type--elective'}">${escapeHtml(CATEGORY_LABELS[course.category] ?? course.category)}</span>
      <h2>${escapeHtml(course.name)}</h2>
      <button type="button" class="button button--quiet course-detail__clear" data-action="clear">선택 해제</button>
    </header>
    <dl class="course-detail__facts">
      <div><dt>학점</dt><dd>${escapeHtml(course.credits)}학점</dd></div>
      <div><dt>권장 학기</dt><dd>${escapeHtml(course.recommendedTerm ?? '확인 필요')}</dd></div>
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

// 과목을 고르지 않았을 때 과목 정보 칸에 보여 줄 안내
const GUIDE_HTML = `
  <p class="course-detail__title">과목 정보</p>
  <p class="course-detail__empty">과목을 누르면 여기에 학점, 선수 과목, 이어서 들을 수 있는 과목이 나옵니다.</p>
  <p class="course-detail__empty">빨간 선은 먼저 꼭 들어야 하는 과목(필수 선수)입니다. 과목을 누르면 먼저 들으면 좋은 과목(권장 선행)이 점선으로 나타납니다.</p>`;

// ---- 과목 정보 칸 ----
// 과목이 가장 적은 학년 섹션(1학년) 아래 빈 자리(positions.js의 panel)에 놓습니다.
// 안쪽 칸은 sticky라서 페이지를 내려도 그 빈 자리 안에서 화면 위쪽에 붙어 따라옵니다.
const DOCK_INSET = 8; // 학년 섹션 상자 안쪽으로 들여 놓는 거리

function placeDock() {
  const { dock, scroller } = elements;
  const { layout, cy } = state;
  const panel = layout?.panel;
  dock.classList.toggle('course-dock--below', !panel); // 빈 자리가 없으면(섹션 1개) 그래프 아래에 둠
  if (!panel) {
    dock.removeAttribute('style');
    return;
  }
  const pan = cy.pan();
  const half = layout.dims.nodeWidth / 2 + SECTION_PADDING - DOCK_INSET;
  dock.style.left = `${scroller.offsetLeft + scroller.clientLeft - scroller.scrollLeft + pan.x + panel.x - half}px`;
  dock.style.top = `${scroller.offsetTop + scroller.clientTop + pan.y + panel.top}px`;
  dock.style.width = `${half * 2}px`;
  dock.style.height = `${panel.bottom - panel.top}px`;
}

// reveal: 과목 정보 칸에서 고른 과목이 보이는 영역 밖에 있으면 가로 스크롤을 옮겨 가운데에 보여 줍니다.
function select(courseId, { reveal = false } = {}) {
  state.selectedId = state.courseById.has(courseId) ? courseId : null;
  paint();
  renderDetail();

  if (reveal && state.selectedId) {
    const { scroller } = elements;
    const box = state.cy.getElementById(state.selectedId).renderedBoundingBox();
    const outside = box.x1 < scroller.scrollLeft || box.x2 > scroller.scrollLeft + scroller.clientWidth;
    if (outside) scrollGraphTo((box.x1 + box.x2) / 2 - scroller.clientWidth / 2);
    // 위아래로 화면 밖이면 페이지를 스크롤해 가운데로
    const top = scroller.getBoundingClientRect().top + box.y1;
    const bottom = scroller.getBoundingClientRect().top + box.y2;
    if (top < 0 || bottom > window.innerHeight) {
      window.scrollTo({
        top: window.scrollY + (top + bottom) / 2 - window.innerHeight / 2,
        behavior: reducedMotion.matches ? 'auto' : 'smooth',
      });
    }
  }
}

function renderFilter() {
  const options = [{ id: 'all', label: '전체' }, ...state.curriculum.tags.map((tag) => ({ id: tag, label: TAG_LABELS[tag] ?? tag }))];
  elements.filter.innerHTML = options
    .map(
      (option) =>
        `<button type="button" class="chip" data-track="${escapeHtml(option.id)}" aria-pressed="${option.id === state.track}">${escapeHtml(option.label)}</button>`,
    )
    .join('');
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

  // 좁은 화면에서 가로로 스크롤하면 과목 정보 칸도 1학년 섹션을 따라 옮깁니다.
  elements.scroller.addEventListener('scroll', placeDock, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selectedId) select(null);
  });

  // 로드맵 창 너비가 바뀌면 다시 그립니다. 창 크기를 바꿀 때뿐 아니라, 그래프가 길어져 페이지 세로 스크롤바가
  // 생기면서 너비가 줄어들 때도 해당됩니다. 끌어서 바꾸는 동안에는 기다렸다가, 멈추면 한 번만 다시 그립니다.
  let resizeTimer;
  new ResizeObserver(() => {
    if (elements.scroller.clientWidth === state.layoutWidth) return; // 높이만 바뀐 경우는 무시
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutGraph();
      paint();
    }, 150);
  }).observe(elements.scroller);
}

// ---- 로드맵 가로 이동: 목표 위치까지 짧게 미끄러지듯 ----
const smoothScroll = { target: null, current: 0, frame: 0 };
const SCROLL_EASE = 0.2; // 한 프레임에 남은 거리의 몇 %를 움직일지

// scrollGraphTo(기준 위치, 더할 거리) — 목표를 정하고 애니메이션을 시작합니다.
function scrollGraphTo(base, delta = 0) {
  const { scroller } = elements;
  const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
  const target = Math.min(max, Math.max(0, base + delta));

  // 동작 줄이기: 바로 이동
  if (reducedMotion.matches) {
    scroller.scrollLeft = target;
    return;
  }
  if (smoothScroll.target === null) smoothScroll.current = scroller.scrollLeft;
  smoothScroll.target = target;
  if (!smoothScroll.frame) smoothScroll.frame = requestAnimationFrame(stepSmoothScroll);
}

function stepSmoothScroll() {
  const { scroller } = elements;
  const distance = smoothScroll.target - smoothScroll.current;
  if (Math.abs(distance) < 0.5) {
    scroller.scrollLeft = smoothScroll.target;
    Object.assign(smoothScroll, { target: null, frame: 0 });
    return;
  }
  // 소수점 위치를 직접 기억해 둠 (scrollLeft는 정수로 반올림돼 아주 작은 이동이 멈출 수 있음)
  smoothScroll.current += distance * SCROLL_EASE;
  scroller.scrollLeft = smoothScroll.current;
  smoothScroll.frame = requestAnimationFrame(stepSmoothScroll);
}

// 로드맵 크기 맞추기: 화면 전체 너비를 학년 섹션 수(보통 4)로 나눠 씁니다.
// - 확대·축소 없이 글자 크기 그대로 (확대 비율 1)
// - 높이는 과목 수만큼 늘어나고 페이지를 위아래로 스크롤해서 봄
// - 창이 너무 좁으면 섹션을 줄이지 않고 가로 스크롤
// 사용자가 확대·축소하거나 끌어서 옮기는 기능은 끕니다.
const GRAPH_PADDING = 24;
const GRAPH_PADDING_TOP = 24; // 학년 제목은 섹션 상자 위에 붙으므로 boundingBox에 이미 포함됨

function layoutGraph() {
  const { cy } = state;
  const { scroller, graph } = elements;
  const courses = state.curriculum.courses;

  const render = (available) => {
    const fit = fitColumns(available, countColumns(courses));
    const layout = computePositions(courses, { nodeWidth: fit.nodeWidth, columnWidth: fit.columnWidth });
    cy.batch(() => {
      cy.elements().remove();
      cy.add(buildElements(state.curriculum, layout));
    });
    return layout;
  };

  // 바깥 섹션 옆 통로로 지나가는 화살표만큼 넘치면, 그만큼 줄여 한 번 더 맞춤 (가로 스크롤이 생기지 않게)
  const available = scroller.clientWidth - GRAPH_PADDING * 2;
  let layout = render(available);
  let box = cy.elements().boundingBox();
  if (box.w > available + 0.5) {
    layout = render(available - (box.w - available));
    box = cy.elements().boundingBox();
  }
  const width = Math.max(scroller.clientWidth, Math.ceil(box.w + GRAPH_PADDING * 2));
  graph.style.width = `${width}px`;
  graph.style.height = `${Math.ceil(box.h + GRAPH_PADDING_TOP + GRAPH_PADDING)}px`;

  cy.resize();
  cy.zoom(1);
  cy.pan({ x: (width - box.w) / 2 - box.x1, y: GRAPH_PADDING_TOP - box.y1 });
  state.layout = layout;
  state.layoutWidth = scroller.clientWidth;
  placeDock();
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


  elements.status.hidden = true;
  state.cy = cytoscape({
    container: elements.graph,
    style: graphStyle(readTokens()),
    layout: { name: 'preset' },
    userZoomingEnabled: false,
    userPanningEnabled: false,
    autoungrabify: true,
    boxSelectionEnabled: false,
  });

  renderFilter();
  bindEvents();
  layoutGraph();
  paint();
  renderDetail();
}

start();
