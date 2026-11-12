// 전공 로드맵 화면: 교육과정을 불러와 Cytoscape 그래프로 그리고, 과목 선택·트랙 필터를 처리합니다.
import { buildCourseGraph, findFollowUps, findPrerequisites } from '/shared/curriculum/graph.js';
import { choosePopupPosition } from '/roadmap/popup-position.js';
import { computePositions, DEFAULT_DIMS, routeEdges } from '/roadmap/positions.js';

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
  select: document.getElementById('course-select'),
  stage: document.getElementById('roadmap-stage'),
  legend: document.getElementById('roadmap-legend'),
  scroller: document.getElementById('roadmap-scroller'),
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
        'font-size': 16,
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
        padding: 16,
        label: 'data(label)',
        color: color.accent,
        'font-family': color.font,
        'font-size': 15,
        'font-weight': 800,
        'text-valign': 'top',
        'text-halign': 'center',
        'text-margin-y': -8,
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
        'font-size': 13,
        'font-weight': 700,
        'text-valign': 'center',
        events: 'no',
      },
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

  const nodes = positions.years.map((year) => ({
    group: 'nodes',
    classes: 'year',
    data: { id: year.id, label: year.label },
    selectable: false,
  }));

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
    const { x, y, year } = positions.courses.get(course.id);
    nodes.push({
      group: 'nodes',
      classes: 'course',
      data: {
        id: course.id,
        label: course.name,
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
      classes: points.length === 0 ? 'straight' : 'bent',
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
    closeDetail();
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
      <button type="button" class="button button--quiet course-detail__clear" data-action="clear">닫기</button>
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

  openDetail();
}

// ---- 과목 정보 팝업 ----
// 열기: 자리를 정한 뒤 살짝 아래에서 떠오르며 나타남 / 다른 과목 선택: 새 자리로 부드럽게 이동 / 닫기: 흐려지며 사라짐
const POPUP_MS = 200; // roadmap.css의 --popup-duration과 같은 값
const POPUP_MOVE_MS = 260; // roadmap.css의 팝업 left/top 이동 시간과 같은 값
let closeTimer;

function openDetail() {
  const { detail } = elements;
  clearTimeout(closeTimer);
  const wasOpen = !detail.hidden && detail.classList.contains('is-open');
  detail.hidden = false;

  if (wasOpen) {
    movePopup();
    return;
  }
  detail.classList.add('is-placing'); // 처음 열 때는 자리 이동 애니메이션 없이 바로 그 자리에
  placeDetail();
  void detail.offsetWidth; // 닫힌 모습을 먼저 그리게 해서 나타나는 애니메이션이 보이도록 함
  detail.classList.remove('is-placing');
  detail.classList.add('is-open');
}

// 열려 있는 팝업을 새 자리로 옮깁니다. 위로 옮겨 가면 페이지가 짧아질 수 있으므로 높이를 붙잡고, 이동이 끝난 뒤 놓아 줍니다.
function movePopup() {
  if (elements.detail.hidden || !state.selectedId) return;
  holdPageHeight();
  placeDetail();
  releasePageHeight(POPUP_MOVE_MS);
}

function closeDetail() {
  const { detail } = elements;
  if (detail.hidden) return;
  holdPageHeight(); // 팝업이 사라져 페이지가 짧아져도 화면이 갑자기 끌려 올라가지 않게
  detail.classList.remove('is-open');
  clearTimeout(closeTimer);
  const hide = () => {
    if (!detail.classList.contains('is-open')) {
      detail.hidden = true;
      detail.innerHTML = '';
    }
  };
  // 동작 줄이기: 기다리지 않고 바로 숨김
  if (reducedMotion.matches) hide();
  else closeTimer = setTimeout(hide, POPUP_MS);
  releasePageHeight(reducedMotion.matches ? 0 : POPUP_MS + 20); // 사라진 뒤 필요한 만큼만 부드럽게 올라감
}

// 화면에 그려진 선택 과목·관련 과목·강조 화살표·범례를 "가리면 안 되는 상자"로 모읍니다. (로드맵 창 기준 좌표)
function protectedBoxes() {
  const { cy } = state;
  const { scroller, stage, legend } = elements;
  const offsetX = scroller.offsetLeft + scroller.clientLeft - scroller.scrollLeft;
  const offsetY = scroller.offsetTop + scroller.clientTop;
  const zoom = cy.zoom();
  const pan = cy.pan();
  const toStage = (point) => ({ x: point.x * zoom + pan.x + offsetX, y: point.y * zoom + pan.y + offsetY });
  const inflate = (box, size) => ({ x1: box.x1 - size, y1: box.y1 - size, x2: box.x2 + size, y2: box.y2 + size });

  const boxes = [];
  cy.nodes('.is-selected, .is-related').forEach((node) => {
    const box = node.renderedBoundingBox({ includeLabels: false });
    boxes.push(inflate({ x1: box.x1 + offsetX, y1: box.y1 + offsetY, x2: box.x2 + offsetX, y2: box.y2 + offsetY }, 8));
  });
  cy.edges('.is-path').forEach((edge) => {
    const points = [edge.sourceEndpoint(), ...(edge.segmentPoints() ?? []), edge.targetEndpoint()].map(toStage);
    for (let i = 1; i < points.length; i += 1) {
      const [a, b] = [points[i - 1], points[i]];
      boxes.push(inflate({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }, 8));
    }
  });

  const stageBox = stage.getBoundingClientRect();
  const legendBox = legend.getBoundingClientRect();
  if (legendBox.width > 0 && getComputedStyle(legend).position === 'absolute') {
    boxes.push(inflate({ x1: legendBox.left - stageBox.left, y1: legendBox.top - stageBox.top, x2: legendBox.right - stageBox.left, y2: legendBox.bottom - stageBox.top }, 8));
  }
  return boxes;
}

// 팝업 위치: 강조된 경로(선택 과목·관련 과목·화살표)를 가리지 않는 자리 중 선택 과목에 가장 가까운 곳.
// 다른(흐리게 된) 과목은 가려도 됩니다. 로드맵 창 아래로 넘어가도 됩니다.
function placeDetail() {
  const { detail, scroller } = elements;
  if (detail.hidden || !state.selectedId) return;

  const node = state.cy.getElementById(state.selectedId);
  const center = node.renderedPosition();
  const anchor = {
    x: center.x + scroller.offsetLeft + scroller.clientLeft - scroller.scrollLeft,
    y: center.y + scroller.offsetTop + scroller.clientTop,
  };
  const { left, top } = choosePopupPosition({
    area: { width: elements.stage.clientWidth, height: scroller.offsetTop + scroller.offsetHeight },
    popup: { width: detail.offsetWidth, height: detail.offsetHeight },
    obstacles: protectedBoxes(),
    anchor,
    minTop: scroller.offsetTop + 12,
  });
  detail.style.left = `${left}px`;
  detail.style.top = `${top}px`;
}

// reveal: 목록·상세 패널에서 고른 과목이 보이는 영역 밖에 있으면 가로 스크롤을 옮겨 가운데에 보여 줍니다.
function select(courseId, { reveal = false } = {}) {
  state.selectedId = state.courseById.has(courseId) ? courseId : null;
  elements.select.value = state.selectedId ?? '';
  paint();
  renderDetail();

  if (reveal && state.selectedId) {
    const { scroller } = elements;
    const box = state.cy.getElementById(state.selectedId).renderedBoundingBox();
    const outside = box.x1 < scroller.scrollLeft || box.x2 > scroller.scrollLeft + scroller.clientWidth;
    if (outside) scrollGraphTo((box.x1 + box.x2) / 2 - scroller.clientWidth / 2);
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

  // 그래프 위의 휠·터치패드 입력은 모두 "로드맵 가로 이동"으로만 씁니다.
  // (끝에 닿아도 페이지 상하 스크롤로 넘기지 않음 → 좌우로 움직이다 페이지가 같이 움직이는 문제 방지)
  // 로드맵이 창에 다 들어와 가로로 움직일 게 없으면 원래대로 페이지가 스크롤됩니다.
  elements.scroller.addEventListener(
    'wheel',
    (event) => {
      const { scroller } = elements;
      if (event.ctrlKey || scroller.scrollWidth <= scroller.clientWidth) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? scroller.clientWidth : 1; // 줄·페이지 단위 → px
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * unit;
      scrollGraphTo(smoothScroll.target ?? scroller.scrollLeft, delta);
    },
    { passive: false },
  );

  // 가로로 스크롤하면 강조된 경로의 화면 위치가 바뀌므로, 스크롤이 멈추면 팝업 자리를 다시 고릅니다.
  let scrollTimer;
  elements.scroller.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(movePopup, 120);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selectedId) select(null);
  });

  // 창 크기를 끌어서 바꾸는 동안에는 기다렸다가, 멈추면 한 번만 다시 그립니다. (매번 다시 그리면 버벅임)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutGraph();
      paint();
      movePopup();
    }, 150);
  });
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

// ---- 페이지 높이 붙잡기 ----
// 팝업은 로드맵 아래로 펼쳐져 페이지를 길게 만듭니다. 닫거나 위로 옮길 때 페이지가 갑자기 짧아지면
// 브라우저가 스크롤 위치를 억지로 끌어올려 화면이 "툭" 움직입니다.
// 그래서 바뀌기 전 높이를 붙잡아 두고, 화면을 억지로 옮기지 않습니다.
// 남은 빈 공간은 사용자가 직접 위로 스크롤하는 만큼만 줄여 나갑니다. (강제 이동 0)
let releaseTimer;

function holdPageHeight() {
  clearTimeout(releaseTimer);
  window.removeEventListener('scroll', shrinkHeldHeight);
  const height = document.documentElement.scrollHeight;
  const held = parseFloat(document.body.style.minHeight) || 0;
  document.body.style.minHeight = `${Math.max(height, held)}px`;
}

// 팝업까지 포함한 "원래 필요한" 페이지 높이 (문서 좌표)
function naturalPageHeight() {
  const { detail } = elements;
  const pageBottom = document.querySelector('.major-map').getBoundingClientRect().bottom + window.scrollY;
  if (detail.hidden) return pageBottom;
  const stageTop = elements.stage.getBoundingClientRect().top + window.scrollY;
  return Math.max(pageBottom, stageTop + parseFloat(detail.style.top) + detail.offsetHeight + 24);
}

// 지금 보이는 화면 아래 끝까지는 남겨 두고, 그보다 아래 빈 공간만 줄입니다.
function shrinkHeldHeight() {
  const natural = naturalPageHeight();
  const visibleBottom = window.scrollY + window.innerHeight;
  if (visibleBottom <= natural + 1) {
    document.body.style.minHeight = '';
    window.removeEventListener('scroll', shrinkHeldHeight);
    return;
  }
  document.body.style.minHeight = `${Math.ceil(visibleBottom)}px`;
}

function releasePageHeight(delay) {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    shrinkHeldHeight();
    if (document.body.style.minHeight) window.addEventListener('scroll', shrinkHeldHeight, { passive: true });
  }, delay);
}

// 로드맵 크기 맞추기
// 1) 높이: 그래프 전체 높이를 로드맵 창 높이에 딱 맞춥니다(상하 스크롤 없음). → 확대 비율이 정해짐
// 2) 넓이: 창이 넓어 공간이 남으면 과목 상자와 칸 사이 간격을 넓혀 창 가로를 채웁니다.
//    창이 좁으면 기본 크기 그대로 두고 가로 스크롤로 봅니다.
// 사용자가 확대·축소하거나 끌어서 옮기는 기능은 끕니다.
const GRAPH_PADDING = 24;
const GRAPH_PADDING_TOP = 64; // 위에 겹쳐 둔 범례 상자만큼 띄움
const MAX_ZOOM = 1.3;
const MAX_NODE_WIDTH = 250; // 과목 상자를 넓힐 수 있는 최대 너비
const MAX_GAP_SCALE = 2.5; // 칸 사이 간격을 넓힐 수 있는 최대 배율

function renderLayout(dims) {
  const layout = computePositions(state.curriculum.courses, dims);
  state.cy.batch(() => {
    state.cy.elements().remove();
    state.cy.add(buildElements(state.curriculum, layout));
  });
  return layout;
}

// 남는 가로 공간(모델 좌표 extra)을 과목 상자 너비 → 칸 사이 간격 순서로 나눠 줍니다.
function stretchDims(layout, extra) {
  const { dims, columns } = layout;
  const gapTotal = columns.slice(1).reduce((sum, x, index) => sum + (x - columns[index] - dims.nodeWidth), 0);
  const nodeExtra = Math.min(MAX_NODE_WIDTH - dims.nodeWidth, (extra * 0.5) / columns.length);
  const gapScale = Math.min(MAX_GAP_SCALE, 1 + (extra - nodeExtra * columns.length) / gapTotal);
  const nodeWidth = dims.nodeWidth + Math.max(0, nodeExtra);
  return {
    ...dims,
    nodeWidth,
    columnWidth: nodeWidth + (dims.columnWidth - dims.nodeWidth) * gapScale,
    yearGap: dims.yearGap * gapScale,
  };
}

function layoutGraph() {
  const { cy } = state;
  const { scroller, graph } = elements;

  // 기본 크기로 그려서 높이 기준 확대 비율을 구함
  graph.style.width = '100%';
  graph.style.height = '0px';
  let layout = renderLayout(DEFAULT_DIMS);
  let box = cy.elements().boundingBox();
  let zoom = Math.min(MAX_ZOOM, (scroller.clientHeight - GRAPH_PADDING_TOP - GRAPH_PADDING) / box.h);

  // 남는 가로 공간이 있으면 상자·간격을 넓혀 다시 그림
  const extra = (scroller.clientWidth - GRAPH_PADDING * 2) / zoom - box.w;
  if (extra > 1) {
    layout = renderLayout(stretchDims(layout, extra));
    box = cy.elements().boundingBox();
  }

  // 넓이를 정한 뒤 가로 스크롤바가 생기면 보이는 높이가 줄어드므로 한 번 더 맞춤 (창에 꼭 맞으면 스크롤바 없음)
  const widthFor = (z) => Math.min(Math.ceil(box.w * z + GRAPH_PADDING * 2), extra > 1 ? scroller.clientWidth : Infinity);
  graph.style.width = `${widthFor(zoom)}px`;
  zoom = Math.min(MAX_ZOOM, (scroller.clientHeight - GRAPH_PADDING_TOP - GRAPH_PADDING) / box.h);
  graph.style.width = `${widthFor(zoom)}px`;
  graph.style.height = `${scroller.clientHeight}px`;

  cy.resize();
  cy.zoom(zoom);
  cy.pan({ x: GRAPH_PADDING - box.x1 * zoom, y: GRAPH_PADDING_TOP - box.y1 * zoom });
  state.layout = layout;
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
  renderSelect();
  bindEvents();
  layoutGraph();
  paint();
}

start();
