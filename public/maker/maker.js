import {
  SEMESTER_KEYS,
  evaluatePlan,
  findPrerequisiteIssues,
  formatSemester,
  indexPlacements,
  semesterOrder,
  summarizeSemesters,
} from './lib/plan-rules.js';
import { parseTranscript, toPlan } from './lib/klas-import.js';
import { SAMPLE_CURRICULUM, SAMPLE_KLAS_TEXT, SAMPLE_PRESETS } from './sample-curriculum.js';

/* ------------------------------------------------------------------
 * 데이터 준비
 * 교육과정 API가 생기면 SAMPLE_CURRICULUM 대신 fetch('/api/curriculum/:dept') 결과를 씁니다.
 * ---------------------------------------------------------------- */
const curriculum = SAMPLE_CURRICULUM;
const catalog = Object.fromEntries(curriculum.courses.map((course) => [course.id, course]));

const MAX_PRESETS = 5;
const STORAGE_KEY = 'curritree.maker.v1';

/* ------------------------------------------------------------------
 * 상태
 * presets[].semesters: { '2-1': ['DS', 'OOP'], ... }
 * presets[].inProgress: 수강 중인 과목 ID (KLAS에서 불러온 경우)
 * history: KLAS에서 불러온 이수 내역. 새 프리셋을 만들 때 기본값으로 씁니다.
 * ---------------------------------------------------------------- */
const state = loadState() ?? createInitialState('2-2');

function createInitialState(currentSemester) {
  const presets = SAMPLE_PRESETS.map((preset) => ({
    id: createId(),
    name: preset.name,
    semesters: { ...completedSemesters(currentSemester), ...cloneSemesters(preset.future) },
  }));
  return {
    currentSemester,
    selectedSemester: currentSemester,
    activePresetId: presets[0].id,
    presets,
    history: null,
    filter: { query: '', type: 'all', tag: null },
  };
}

/** 지금 학기 이전의 권장 과목을 이수 완료로 미리 채웁니다. 학생이 직접 빼거나 더할 수 있습니다. */
function completedSemesters(currentSemester) {
  const semesters = {};
  for (const course of curriculum.courses) {
    if (semesterOrder(course.recommendedSemester) < semesterOrder(currentSemester)) {
      (semesters[course.recommendedSemester] ??= []).push(course.id);
    }
  }
  return semesters;
}

function cloneSemesters(semesters) {
  return Object.fromEntries(Object.entries(semesters).map(([key, ids]) => [key, [...ids]]));
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activePreset() {
  return state.presets.find((preset) => preset.id === state.activePresetId) ?? state.presets[0];
}

// 브라우저 저장소는 편의 기능입니다. 막혀 있어도 화면은 그대로 동작합니다.
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.presets?.length && SEMESTER_KEYS.includes(saved.currentSemester)) {
      saved.filter = { query: '', type: 'all', tag: null };
      saved.selectedSemester = SEMESTER_KEYS.includes(saved.selectedSemester)
        ? saved.selectedSemester
        : saved.currentSemester;
      return saved;
    }
  } catch {
    // 무시하고 예시 상태로 시작
  }
  return null;
}

function saveState() {
  try {
    const { filter: _filter, ...persisted } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // 저장 실패는 무시
  }
}

/* ------------------------------------------------------------------
 * 동작
 * ---------------------------------------------------------------- */
function placeCourse(courseId, semesterKey) {
  const { semesters } = activePreset();
  for (const key of Object.keys(semesters)) {
    semesters[key] = semesters[key].filter((id) => id !== courseId);
  }
  (semesters[semesterKey] ??= []).push(courseId);
  commit();
}

function removeCourse(courseId) {
  const preset = activePreset();
  for (const key of Object.keys(preset.semesters)) {
    preset.semesters[key] = preset.semesters[key].filter((id) => id !== courseId);
  }
  preset.inProgress = (preset.inProgress ?? []).filter((id) => id !== courseId);
  commit();
}

/** KLAS에서 불러온 결과로 현재 프리셋을 바꿉니다. 불러온 학기 외에는 비웁니다. */
function applyImport(result) {
  const preset = activePreset();
  preset.semesters = cloneSemesters(result.semesters);
  preset.inProgress = [...result.inProgress];
  state.history = { semesters: cloneSemesters(result.semesters), inProgress: [...result.inProgress] };
  if (result.currentSemester) {
    state.currentSemester = result.currentSemester;
    state.selectedSemester = result.currentSemester;
  }
  commit();
}

function addPreset() {
  if (state.presets.length >= MAX_PRESETS) return;
  const preset = {
    id: createId(),
    name: `프리셋 ${state.presets.length + 1}`,
    semesters: state.history ? cloneSemesters(state.history.semesters) : completedSemesters(state.currentSemester),
    inProgress: state.history ? [...state.history.inProgress] : [],
  };
  state.presets.push(preset);
  state.activePresetId = preset.id;
  commit('preset:' + preset.id);
}

function deletePreset() {
  if (state.presets.length <= 1) return;
  const index = state.presets.findIndex((preset) => preset.id === state.activePresetId);
  state.presets.splice(index, 1);
  state.activePresetId = state.presets[Math.max(0, index - 1)].id;
  commit('preset:' + state.activePresetId);
}

function commit(focusKey) {
  saveState();
  render(focusKey);
}

/* ------------------------------------------------------------------
 * 화면 그리기
 * ---------------------------------------------------------------- */
const elements = {
  currentSemester: document.getElementById('current-semester'),
  presetTabs: document.getElementById('preset-tabs'),
  addPreset: document.getElementById('add-preset'),
  presetName: document.getElementById('preset-name'),
  deletePreset: document.getElementById('delete-preset'),
  libraryTarget: document.getElementById('library-target'),
  search: document.getElementById('course-search'),
  typeChips: document.querySelectorAll('.chip[data-type]'),
  tagFilters: document.getElementById('tag-filters'),
  courseList: document.getElementById('course-list'),
  board: document.getElementById('board'),
  verdict: document.getElementById('verdict'),
  checks: document.getElementById('checks'),
};

/** 작은 DOM 헬퍼: h('div', { class: 'x' }, '텍스트', child) */
function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (name === 'dataset') Object.assign(element.dataset, value);
    else if (name.startsWith('on')) element.addEventListener(name.slice(2), value);
    else element.setAttribute(name, value === true ? '' : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

function render(focusKey = document.activeElement?.dataset?.focusKey) {
  const preset = activePreset();
  const plan = { semesters: preset.semesters };
  const placements = indexPlacements(plan);
  const issues = findPrerequisiteIssues(plan, catalog);
  const evaluation = evaluatePlan(plan, catalog, curriculum.requirements);

  renderSetup();
  renderPresets(preset);
  renderLibrary(placements);
  renderBoard(plan, issues);
  renderReport(evaluation);

  if (focusKey) {
    document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

function renderSetup() {
  if (!elements.currentSemester.options.length) {
    for (const key of SEMESTER_KEYS) {
      elements.currentSemester.append(h('option', { value: key }, formatSemester(key)));
    }
  }
  elements.currentSemester.value = state.currentSemester;
}

function renderPresets(preset) {
  elements.presetTabs.replaceChildren(
    ...state.presets.map((item) =>
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'preset-tab',
          'aria-selected': String(item.id === preset.id),
          dataset: { focusKey: 'preset:' + item.id },
          onclick: () => {
            state.activePresetId = item.id;
            commit('preset:' + item.id);
          },
        },
        item.name,
      ),
    ),
  );
  elements.addPreset.disabled = state.presets.length >= MAX_PRESETS;
  elements.addPreset.textContent =
    state.presets.length >= MAX_PRESETS ? `프리셋은 ${MAX_PRESETS}개까지` : '새 프리셋';
  elements.deletePreset.disabled = state.presets.length <= 1;
  if (document.activeElement !== elements.presetName) {
    elements.presetName.value = preset.name;
  }
}

function renderLibrary(placements) {
  const { query, type, tag } = state.filter;
  const normalized = query.trim().toLowerCase();

  elements.libraryTarget.replaceChildren(
    '담을 학기 ',
    h('strong', {}, formatSemester(state.selectedSemester)),
  );

  for (const chip of elements.typeChips) {
    chip.setAttribute('aria-pressed', String(chip.dataset.type === type));
  }

  elements.tagFilters.replaceChildren(
    ...curriculum.tags.map((name) =>
      h(
        'button',
        {
          type: 'button',
          class: 'chip',
          'aria-pressed': String(tag === name),
          dataset: { focusKey: 'tag:' + name },
          onclick: () => {
            state.filter.tag = state.filter.tag === name ? null : name;
            render('tag:' + name);
          },
        },
        name,
      ),
    ),
  );

  // 아직 담지 않은 과목을 위로, 그다음 권장 학기 순
  const visible = curriculum.courses.filter(
    (course) =>
      (type === 'all' || course.type === type) &&
      (!tag || course.tags.includes(tag)) &&
      (!normalized || course.name.toLowerCase().includes(normalized)),
  ).sort(
    (a, b) =>
      Number(placements.has(a.id)) - Number(placements.has(b.id)) ||
      semesterOrder(a.recommendedSemester) - semesterOrder(b.recommendedSemester),
  );

  if (!visible.length) {
    elements.courseList.replaceChildren(
      h('li', { class: 'course-list__empty' }, '조건에 맞는 과목이 없습니다. 검색어나 필터를 바꿔 보세요.'),
    );
    return;
  }

  elements.courseList.replaceChildren(
    ...visible.map((course) => {
      const placedIn = placements.get(course.id);
      const inTarget = placedIn === state.selectedSemester;
      const inProgress = (activePreset().inProgress ?? []).includes(course.id);
      const status = !placedIn
        ? `권장 ${formatSemester(course.recommendedSemester)}`
        : inProgress
          ? `${formatSemester(placedIn)} 수강 중`
          : inTarget
            ? '이 학기에 담김'
            : `${formatSemester(placedIn)}에 담김`;

      return h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `course${placedIn ? ' is-placed' : ''}`,
            draggable: 'true',
            'aria-disabled': inTarget ? 'true' : null,
            dataset: { focusKey: 'course:' + course.id },
            title: placedIn && !inTarget ? `누르면 ${formatSemester(state.selectedSemester)}로 옮깁니다` : null,
            onclick: () => {
              if (!inTarget) placeCourse(course.id, state.selectedSemester);
            },
            ondragstart: (event) => startDrag(event, course.id),
          },
          h('span', { class: 'course__name' }, course.name),
          h(
            'span',
            { class: 'course__meta' },
            h('span', { class: `type type--${course.type === '전필' ? 'required' : 'elective'}` }, course.type),
            `${course.credits}학점`,
          ),
          h('span', { class: 'course__status' }, status),
        ),
      );
    }),
  );
}

function renderBoard(plan, issues) {
  const summaries = new Map(
    summarizeSemesters(plan, catalog, curriculum.requirements.maxCreditsPerSemester).map((item) => [
      item.key,
      item,
    ]),
  );
  const issuesByCourse = new Map();
  for (const issue of issues) {
    if (!issuesByCourse.has(issue.courseId)) issuesByCourse.set(issue.courseId, []);
    issuesByCourse.get(issue.courseId).push(issue);
  }

  const years = [1, 2, 3, 4].map((year) =>
    h(
      'div',
      { class: 'year' },
      h('h3', { class: 'year__label' }, `${year}학년`),
      h(
        'div',
        { class: 'year__terms' },
        [1, 2].map((term) => renderTerm(`${year}-${term}`, plan, summaries.get(`${year}-${term}`), issuesByCourse)),
      ),
    ),
  );
  elements.board.replaceChildren(...years);
}

function renderTerm(key, plan, summary, issuesByCourse) {
  const order = semesterOrder(key);
  const currentOrder = semesterOrder(state.currentSemester);
  const phase = order < currentOrder ? 'past' : order === currentOrder ? 'current' : 'future';
  const selected = key === state.selectedSemester;
  const courseIds = plan.semesters[key] ?? [];
  const term = key.split('-')[1];

  const badge = { past: '이수 완료', current: '이번 학기', future: null }[phase];

  return h(
    'section',
    {
      class: `term term--${phase}${selected ? ' is-selected' : ''}`,
      'aria-label': formatSemester(key),
      // 학기 칸 아무 곳이나 누르면 그 학기를 고릅니다. (과목 빼기 버튼은 제외)
      // 키보드 사용자는 칸 안의 학기 이름 버튼으로 같은 동작을 합니다.
      onclick: (event) => {
        if (event.target.closest('.placed__remove')) return;
        if (state.selectedSemester === key) return;
        state.selectedSemester = key;
        commit('term:' + key);
      },
      ondragover: (event) => {
        event.preventDefault();
        event.currentTarget.classList.add('is-drop');
      },
      ondragleave: (event) => event.currentTarget.classList.remove('is-drop'),
      ondrop: (event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('is-drop');
        const courseId = event.dataTransfer.getData('text/plain');
        if (catalog[courseId]) placeCourse(courseId, key);
      },
    },
    h(
      'header',
      { class: 'term__head' },
      h(
        'button',
        {
          type: 'button',
          class: 'term__select',
          'aria-pressed': String(selected),
          dataset: { focusKey: 'term:' + key },
        },
        `${term}학기`,
        badge && h('span', { class: 'term__badge' }, badge),
      ),
      h(
        'span',
        { class: `term__credits${summary.overLimit ? ' is-over' : ''}` },
        `${summary.credits}학점`,
        summary.overLimit ? ` · 상한 ${curriculum.requirements.maxCreditsPerSemester} 초과` : '',
      ),
    ),
    courseIds.length
      ? h(
          'ul',
          { class: 'term__courses' },
          courseIds.map((id) => renderPlacedCourse(id, key, issuesByCourse.get(id) ?? [])),
        )
      : h('p', { class: 'term__empty' }, selected ? '왼쪽 목록에서 과목을 누르세요' : '비어 있음'),
  );
}

function renderPlacedCourse(id, semesterKey, courseIssues) {
  const course = catalog[id];
  if (!course) return null;

  const warning = courseIssues.length
    ? courseIssues
        .map((issue) =>
          issue.kind === 'missing'
            ? `선수 과목 ${catalog[issue.prerequisiteId]?.name ?? issue.prerequisiteId} 없음`
            : `선수 과목 ${catalog[issue.prerequisiteId]?.name ?? issue.prerequisiteId} 먼저`,
        )
        .join(', ')
    : null;

  return h(
    'li',
    {
      class: `placed${warning ? ' has-issue' : ''}`,
      draggable: 'true',
      ondragstart: (event) => startDrag(event, id),
    },
    h(
      'span',
      { class: 'placed__name' },
      course.name,
      (activePreset().inProgress ?? []).includes(id) && h('span', { class: 'placed__progress' }, '수강 중'),
    ),
    h(
      'span',
      { class: 'placed__meta' },
      h('span', { class: `type type--${course.type === '전필' ? 'required' : 'elective'}` }, course.type),
      `${course.credits}`,
    ),
    warning && h('span', { class: 'placed__warning' }, warning),
    h(
      'button',
      {
        type: 'button',
        class: 'placed__remove',
        'aria-label': `${course.name} 빼기`,
        title: '빼기',
        onclick: () => {
          removeCourse(id);
          document.querySelector(`[data-focus-key="term:${semesterKey}"]`)?.focus();
        },
      },
      '×',
    ),
  );
}

function renderReport(evaluation) {
  const byId = Object.fromEntries(evaluation.items.map((item) => [item.id, item]));
  const needs = [];
  const major = byId['major-credits'];
  const required = byId['required-courses'];
  const elective = byId['elective-credits'];
  const prerequisites = byId.prerequisites;
  const load = byId['semester-load'];

  if (major.status === 'unmet') needs.push(`전공 ${major.required - major.current}학점`);
  if (required.status === 'unmet') needs.push(`전공필수 ${required.missing.length}과목`);
  if (elective.status === 'unmet') needs.push(`전공선택 ${elective.required - elective.current}학점`);

  const fixes = [];
  if (prerequisites.status === 'unmet') fixes.push(`선수 과목 순서 ${prerequisites.issues.length}건`);
  if (load.status === 'unmet') fixes.push(`학점 초과 ${load.overloaded.length}개 학기`);

  const summary = evaluation.passed
    ? ['이 계획대로 들으면 전공 요건을 모두 채웁니다.']
    : [needs.length && `부족: ${needs.join(', ')}`, fixes.length && `고칠 것: ${fixes.join(', ')}`].filter(Boolean);

  elements.verdict.className = `verdict verdict--${evaluation.passed ? 'ok' : 'fail'}`;
  elements.verdict.replaceChildren(
    h('p', { class: 'verdict__label' }, evaluation.passed ? '졸업요건 충족' : '졸업요건 미충족'),
    ...summary.map((line) => h('p', { class: 'verdict__summary' }, line)),
  );

  elements.checks.replaceChildren(
    creditCheck(major, '학점'),
    countCheck(required, (id) => catalog[id]?.name ?? id),
    creditCheck(elective, '학점'),
    listCheck(
      prerequisites,
      '순서 문제 없음',
      prerequisites.issues?.map((issue) =>
        issue.kind === 'missing'
          ? `${catalog[issue.courseId].name} — 선수 과목 ${catalog[issue.prerequisiteId]?.name} 없음`
          : `${catalog[issue.courseId].name} — ${catalog[issue.prerequisiteId]?.name} 다음 학기 이후로`,
      ),
    ),
    listCheck(
      load,
      `모든 학기 ${curriculum.requirements.maxCreditsPerSemester}학점 이하`,
      load.overloaded?.map((item) => `${formatSemester(item.key)} ${item.credits}학점`),
    ),
  );
}

function checkShell(item, value, ...body) {
  const statusText = { met: '충족', unmet: '미충족', unknown: '확인 필요' }[item.status];
  return h(
    'li',
    { class: `check check--${item.status}` },
    h(
      'div',
      { class: 'check__head' },
      h('span', { class: 'check__label' }, item.label),
      h('span', { class: 'check__value' }, value),
    ),
    ...body,
    h('span', { class: 'visually-hidden' }, statusText),
  );
}

function creditCheck(item, unit) {
  if (item.status === 'unknown') {
    return checkShell(item, `${item.current}${unit} · 기준 확인 필요`);
  }
  const bar = h('span', { class: 'meter__fill' });
  bar.style.setProperty('--ratio', String(Math.min(1, item.current / item.required)));
  const remaining = item.required - item.current;
  return checkShell(
    item,
    `${item.current} / ${item.required}${unit}`,
    h('span', { class: 'meter', 'aria-hidden': 'true' }, bar),
    h('span', { class: 'check__detail' }, remaining > 0 ? `${remaining}${unit} 부족` : '충족'),
  );
}

function countCheck(item, nameOf) {
  const bar = h('span', { class: 'meter__fill' });
  bar.style.setProperty('--ratio', String(item.required ? item.current / item.required : 1));
  return checkShell(
    item,
    `${item.current} / ${item.required}과목`,
    h('span', { class: 'meter', 'aria-hidden': 'true' }, bar),
    h(
      'span',
      { class: 'check__detail' },
      item.missing.length ? `빠진 과목: ${item.missing.map(nameOf).join(', ')}` : '모두 담김',
    ),
  );
}

function listCheck(item, okText, lines = []) {
  return checkShell(
    item,
    item.status === 'met' ? '충족' : `${lines.length}건`,
    item.status === 'met'
      ? h('span', { class: 'check__detail' }, okText)
      : h('ul', { class: 'check__list' }, lines.map((line) => h('li', {}, line))),
  );
}

function startDrag(event, courseId) {
  event.dataTransfer.setData('text/plain', courseId);
  event.dataTransfer.effectAllowed = 'move';
}

/* ------------------------------------------------------------------
 * 고정 요소 이벤트
 * ---------------------------------------------------------------- */
elements.currentSemester.addEventListener('change', (event) => {
  state.currentSemester = event.target.value;
  state.selectedSemester = event.target.value;
  commit();
});

elements.addPreset.addEventListener('click', addPreset);
elements.deletePreset.addEventListener('click', deletePreset);

elements.presetName.addEventListener('input', (event) => {
  const name = event.target.value.trim();
  if (!name) return;
  activePreset().name = name;
  saveState();
  renderPresets(activePreset());
});
elements.presetName.addEventListener('blur', () => renderPresets(activePreset()));

elements.search.addEventListener('input', (event) => {
  state.filter.query = event.target.value;
  renderLibrary(indexPlacements({ semesters: activePreset().semesters }));
});

for (const chip of elements.typeChips) {
  chip.dataset.focusKey = 'type:' + chip.dataset.type;
  chip.addEventListener('click', () => {
    state.filter.type = chip.dataset.type;
    render('type:' + chip.dataset.type);
  });
}

/* ------------------------------------------------------------------
 * KLAS 수강 내역 불러오기
 * ---------------------------------------------------------------- */
const importUi = {
  dialog: document.getElementById('import-dialog'),
  text: document.getElementById('import-text'),
  preview: document.getElementById('import-preview'),
  check: document.getElementById('import-check'),
  apply: document.getElementById('import-apply'),
  sample: document.getElementById('import-sample'),
};
let pendingImport = null;

function resetImportPreview() {
  pendingImport = null;
  importUi.apply.disabled = true;
  importUi.preview.replaceChildren();
}

function checkImport() {
  const parsed = parseTranscript(importUi.text.value, curriculum.courses);
  const result = toPlan(parsed);
  const total = Object.values(result.semesters).flat().length;

  if (!total) {
    resetImportPreview();
    importUi.preview.replaceChildren(
      h(
        'p',
        { class: 'import__error' },
        '교육과정에 있는 과목을 찾지 못했습니다. 학기 이름 줄과 과목 표가 함께 복사됐는지 확인하세요.',
      ),
      ...result.warnings.map((warning) => h('p', { class: 'import__warning' }, warning)),
    );
    return;
  }

  pendingImport = result;
  importUi.apply.disabled = false;

  const bySemester = SEMESTER_KEYS.filter((key) => result.semesters[key]?.length).map((key) => {
    const sources = result.mapping.filter((item) => item.key === key).map((item) => item.label);
    const names = result.semesters[key].map(
      (id) => catalog[id].name + (result.inProgress.includes(id) ? ' (수강 중)' : ''),
    );
    return h(
      'li',
      {},
      h('strong', {}, formatSemester(key)),
      h('span', { class: 'import__source' }, ` ← ${sources.join(', ')}`),
      h('br'),
      names.join(', '),
    );
  });

  importUi.preview.replaceChildren(
    h('p', {}, `${total}과목을 찾았습니다. 지금 다니는 학기는 ${formatSemester(result.currentSemester)}로 맞춥니다.`),
    h('ul', { class: 'import__result' }, bySemester),
    parsed.unmatched.length &&
      h(
        'p',
        { class: 'import__warning' },
        `교육과정 목록에 없어 제외한 줄 ${parsed.unmatched.length}개 (교양 등): `,
        parsed.unmatched
          .slice(0, 5)
          .map((row) => row.text.split(/\t|\s{2,}/).find((cell) => /[가-힣]/.test(cell)) ?? row.text)
          .join(', ') + (parsed.unmatched.length > 5 ? ' …' : ''),
      ),
    ...result.warnings.map((warning) => h('p', { class: 'import__warning' }, warning)),
    h('p', { class: 'import__note' }, `적용하면 '${activePreset().name}' 프리셋의 학기가 모두 바뀌고, 남은 학기는 비워집니다.`),
  );
}

document.getElementById('import-open').addEventListener('click', () => {
  resetImportPreview();
  importUi.dialog.showModal();
  importUi.text.focus();
});
importUi.text.addEventListener('input', resetImportPreview);
importUi.check.addEventListener('click', checkImport);
importUi.sample.addEventListener('click', () => {
  importUi.text.value = SAMPLE_KLAS_TEXT;
  checkImport();
});
importUi.apply.addEventListener('click', () => {
  if (!pendingImport) return;
  applyImport(pendingImport);
  importUi.dialog.close();
});

render();
