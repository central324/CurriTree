import { parseKlasText } from './parser.js';
import { matchParsedCourses } from './matcher.js';
import { buildMakerPlan } from './plan.js';
import {
  saveMakerTransfer,
} from './admission-handoff.js';
import { requestAiMatches } from './ai-request.js';
import {
  SAMPLE_CURRENT_TERM,
  SAMPLE_KLAS_TEXT,
} from './sample-data.js';
import {
  isValidCurrentTerm,
  getKlasInputHint,
  getKlasWarningGuidance,
  getKlasLineSelection,
} from './input-feedback.js';
import {
  getHandoffSafetyState,
  confirmHandoffWithUser,
} from './handoff-safety.js';
import {
  getAdmissionYearSupport,
} from '/shared/curriculum/admission-year.js';

const form = document.getElementById('klas-form');
const curriculumSelect = document.getElementById('curriculum-id');
const admissionYearInput = document.getElementById('admission-year');
const admissionScope = document.getElementById('admission-scope');
const currentTermInput = document.getElementById('current-term');
const klasTextInput = document.getElementById('klas-text');

const textCount = document.getElementById('text-count');
const analyzeButton = document.getElementById('analyze-button');
const clearButton = document.getElementById('clear-button');
const sampleButton = document.getElementById('sample-button');
const message = document.getElementById('klas-message');

const preview = document.getElementById('klas-preview');
const resultsContainer = document.getElementById('klas-results');

const curriculumDepartments = new Map();

// 교육과정별 학과 이름과 적용 입학년도를 관리합니다.
const curriculumMetadata = new Map();

let analysisVersion = 0;

let activeResult = null;
let aiLoading = false;
let aiFeedback = '';
let aiRequestController = null;

const aiSuggestions = new Map();

const CONFIDENCE_LABELS = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

const CATEGORY_LABELS = {
  major_required: '전공필수',
  major_elective: '전공선택',
  general_required: '교양필수',
  general_elective: '교양선택',
  unknown: '확인 필요',
};

const STATUS_LABELS = {
  completed: '이수 완료',
  in_progress: '수강 중',
  failed: '미이수',
  deleted: '성적 삭제',
  needs_review: '확인 필요',
};

const REVIEW_LABELS = {
  AMBIGUOUS_CODE: '학정번호가 일치하는 과목이 여러 개입니다.',
  AMBIGUOUS_NAME: '과목명이 일치하는 과목이 여러 개입니다.',
  CODE_NAME_CONFLICT: '학정번호와 과목명이 서로 다른 과목을 가리킵니다.',
  NO_MATCH: '교육과정에서 일치하는 과목을 찾지 못했습니다.',
};

function isMajorCourse(course) {
  return (
    course.category === 'major_required' ||
    course.category === 'major_elective'
  );
}

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = 'klas__message';

  if (type) {
    message.classList.add(`klas__message--${type}`);
  }
}

function setDefaultCurrentTerm() {
  const today = new Date();
  const semester = today.getMonth() < 6 ? 1 : 2;

  currentTermInput.value = `${today.getFullYear()}-${semester}`;
}

function clearResults() {
  preview.hidden = true;
  resultsContainer.replaceChildren();
}

/**
 * 현재 선택한 교육과정과 사용자의 입학년도를 비교합니다.
 * 데이터가 없거나 잘못된 경우에는 null을 반환합니다.
 */
function getSelectedAdmissionSupport() {
  const info = curriculumMetadata.get(curriculumSelect.value);

  if (!info) {
    return null;
  }

  try {
    return getAdmissionYearSupport({
      admissionYear: admissionYearInput.value,
      admissionYears: info.admissionYears,
    });
  } catch {
    return null;
  }
}

/**
 * KLAS 입력 화면에 적용 학번 및 지원 여부를 표시합니다.
 */
function renderAdmissionScope() {
  const info = curriculumMetadata.get(curriculumSelect.value);

  admissionScope.className = 'klas__admission-scope';

  if (!info) {
    admissionScope.textContent =
      '교육과정을 선택하면 적용 입학년도를 확인할 수 있습니다.';
    return;
  }

  const support = getSelectedAdmissionSupport();

  if (!support) {
    admissionScope.textContent =
      '교육과정의 적용 입학년도 정보를 확인할 수 없습니다. ' +
      '교육과정 데이터를 확인해주세요.';

    admissionScope.classList.add(
      'klas__admission-scope--warning'
    );
    return;
  }

  const years = support.supportedYears
    .map((year) => `${year}학번`)
    .join(', ');

  const prefix =
    `${info.departmentName} · 적용 입학년도: ${years}`;

  switch (support.status) {
    case 'supported':
      admissionScope.textContent =
        `${prefix}. 입력한 ${support.admissionYear}학번은 ` +
        '지원 대상입니다.' +
        (support.admissionYear === 2022
          ? ' 2023학년도 기준 교육과정을 공통 적용하며, ' +
            '과거 교과목 정보는 실제 수강 이력을 확인해주세요.'
          : '');

      admissionScope.classList.add(
        'klas__admission-scope--supported'
      );
      break;

    case 'unsupported':
      admissionScope.textContent =
        `${prefix}. 입력한 ${support.admissionYear}학번은 ` +
        '지원되지 않습니다. 이 교육과정의 과목 매칭과 ' +
        '이수요건을 본인의 공식 기준으로 사용할 수 없습니다.';

      admissionScope.classList.add(
        'klas__admission-scope--warning'
      );
      break;

    case 'invalid':
      admissionScope.textContent =
        `${prefix}. 입학년도를 2023과 같은 ` +
        '4자리 숫자로 입력해주세요.';

      admissionScope.classList.add(
        'klas__admission-scope--warning'
      );
      break;

    default:
      admissionScope.textContent =
        `${prefix}. 분석을 시작하려면 본인의 ` +
        '입학년도를 입력해주세요.';
  }
}


function refreshAnalyzeButton() {
  const hasText = klasTextInput.value.trim().length > 0;
  const hasCurriculum = curriculumSelect.value !== '';
  const validTerm = isValidCurrentTerm(currentTermInput.value);

  const support = getSelectedAdmissionSupport();
  const isSupported = support?.status === 'supported';

  // 입학년도와 교육과정이 일치하는 경우에만 분석을 허용합니다.
  analyzeButton.disabled = !(
    hasText &&
    hasCurriculum &&
    validTerm &&
    isSupported
  );
}

function cancelPendingAiRequest() {
  if (!aiRequestController) {
    return;
  }

  // 현재 진행 중인 AI 요청을 취소합니다.
  aiRequestController.abort();
  aiRequestController = null;

  aiLoading = false;
  aiFeedback = '';
}

function updateInputState() {
  cancelPendingAiRequest();

  analysisVersion += 1;

  activeResult = null;
  aiLoading = false;
  aiFeedback = '';
  aiSuggestions.clear();

  textCount.textContent =
    `${klasTextInput.value.length.toLocaleString()}자 입력`;

  analyzeButton.textContent = '과목 분석 및 매칭';

  renderAdmissionScope();
  refreshAnalyzeButton();
  clearResults();
  setMessage('');
}

function handleInputChange() {
  updateInputState();

  const hint = getKlasInputHint(
    klasTextInput.value,
    currentTermInput.value
  );

  if (hint) {
    setMessage(hint, 'error');
  }
}

function fillSampleInput() {
  const hasExistingText = klasTextInput.value.trim().length > 0;
  const isAlreadySample = klasTextInput.value === SAMPLE_KLAS_TEXT;

  // 기존 입력 내용이 있다면 덮어쓰기 전에 확인합니다.
  if (hasExistingText && !isAlreadySample) {
    const shouldReplace = window.confirm(
      '현재 입력한 내용을 예시 데이터로 바꾸시겠습니까?'
    );

    if (!shouldReplace) {
      return;
    }
  }

  klasTextInput.value = SAMPLE_KLAS_TEXT;
  currentTermInput.value = SAMPLE_CURRENT_TERM;

  // 기존 분석 결과와 진행 중인 AI 요청을 초기화합니다.
  updateInputState();

  setMessage(
    '가상 이수내역을 입력했습니다. ' +
    '교육과정을 확인한 뒤 과목 분석 및 매칭을 눌러주세요.'
  );

  klasTextInput.focus();
}

async function loadCurricula() {
  try {
    const response = await fetch('/api/departments');

    if (!response.ok) {
      throw new Error('교육과정 목록 조회 실패');
    }

    const data = await response.json();

    if (!Array.isArray(data.departments)) {
      throw new Error('잘못된 교육과정 목록');
    }

    curriculumSelect.replaceChildren(
      new Option('교육과정을 선택하세요.', '')
    );

    curriculumDepartments.clear();
    curriculumMetadata.clear();

    let defaultCurriculumId = '';

    for (const department of data.departments) {
      if (!Array.isArray(department.curricula)) {
        continue;
      }

      for (const curriculum of department.curricula) {
        const label =
          `${department.name ?? department.id} · ` +
          `${curriculum.catalogYear ?? curriculum.id}` +
          `${curriculum.isDemo ? ' (예시 데이터)' : ''}`;

        curriculumSelect.add(new Option(label, curriculum.id));

        curriculumDepartments.set(curriculum.id, department.id);

        curriculumMetadata.set(curriculum.id, {
          departmentName: department.name ?? department.id,
          admissionYears: curriculum.admissionYears,
        });
      }

      if (
        !defaultCurriculumId &&
        typeof department.defaultCurriculumId === 'string'
      ) {
        defaultCurriculumId = department.defaultCurriculumId;
      }
    }

    if (defaultCurriculumId) {
      curriculumSelect.value = defaultCurriculumId;
    }

    curriculumSelect.disabled = curriculumSelect.options.length <= 1;

    updateInputState();

    if (curriculumSelect.disabled) {
      setMessage('선택할 수 있는 교육과정이 없습니다.', 'error');
    }
  } catch {
    curriculumSelect.replaceChildren(
      new Option('교육과정을 불러오지 못했습니다.', '')
    );

    curriculumSelect.disabled = true;
    analyzeButton.disabled = true;

    setMessage(
      '교육과정을 불러오지 못했습니다. 서버 상태를 확인해주세요.',
      'error'
    );
  }
}

async function loadSelectedCurriculum() {
  const curriculumId = curriculumSelect.value;
  const departmentId = curriculumDepartments.get(curriculumId);

  if (!curriculumId || !departmentId) {
    throw new Error('교육과정을 선택해주세요.');
  }

  const url =
    `/api/curriculum/${encodeURIComponent(departmentId)}` +
    `?curriculumId=${encodeURIComponent(curriculumId)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('교육과정 조회에 실패했습니다.');
  }

  const curriculum = await response.json();

  if (
    curriculum.curriculumId !== curriculumId ||
    !Array.isArray(curriculum.courses)
  ) {
    throw new Error('교육과정 데이터 형식이 올바르지 않습니다.');
  }

  return curriculum;
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  element.textContent = String(text);

  return element;
}

function createSummary(courses, reviewIssues, warnings) {
  const container = document.createElement('div');
  container.className = 'klas__summary';

  const completed = courses.filter(
    (course) => course.completionStatus === 'completed'
  ).length;

  const exact = courses.filter(
    (course) => course.match.status === 'exact'
  ).length;

  const confirmed = courses.filter(
    (course) => course.match.status === 'confirmed'
  ).length;

  const nonMajor = courses.filter(
    (course) =>
      course.category === 'general_required' ||
      course.category === 'general_elective'
  ).length;

  const summary = [
    `추출 과목 ${courses.length}개`,
    `이수 완료 ${completed}개`,
    `자동 매칭 ${exact}개`,
    `사용자 확정 ${confirmed}개`,
    `매칭 확인 필요 ${reviewIssues.length}개`,
    `교양 과목 ${nonMajor}개`,
  ];

  for (const item of summary) {
    container.appendChild(
      createTextElement('span', 'klas__summary-item', item)
    );
  }

  if (warnings.length > 0) {
    container.appendChild(
      createTextElement(
        'span',
        'klas__summary-item klas__summary-item--warning',
        `파싱 경고 ${warnings.length}건`
      )
    );
  }

  return container;
}

function getMatchDisplay(course, curriculumCourseMap, issueMap) {
  if (
    course.match.status === 'exact' ||
    course.match.status === 'confirmed'
  ) {
    const matchedCourse = curriculumCourseMap.get(course.match.courseId);
    const name = matchedCourse?.name ?? course.match.courseId;

    return {
      text:
        course.match.status === 'confirmed'
          ? `사용자 확정: ${name}`
          : `자동 매칭: ${name}`,
      className: 'klas__match--exact',
    };
  }
  if (course.match.status === 'suggested') {
    return {
        text: 'AI 추천 후보 있음 · 사용자 확인 필요',
        className: 'klas__match--review',
    };
  }

  if (!isMajorCourse(course)) {
    return {
      text: '전공 매칭 대상 아님',
      className: '',
    };
  }

  const issue = issueMap.get(course.clientRowId);

  return {
    text: issue?.reason === 'NO_MATCH'
      ? '매칭되지 않음'
      : '매칭 확인 필요',
    className: 'klas__match--review',
  };
}

function createCourseTable(courses, curriculum, reviewIssues) {
  const wrapper = document.createElement('div');
  wrapper.className = 'klas__table-wrapper';

  const table = document.createElement('table');
  table.className = 'klas__table';

  const headers = [
    '학기',
    '과목명',
    '학정번호',
    '이수구분',
    '학점',
    '이수 상태',
    '매칭 결과',
  ];

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  for (const header of headers) {
    const th = createTextElement('th', '', header);
    th.scope = 'col';
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const curriculumCourseMap = new Map(
    curriculum.courses.map((course) => [course.id, course])
  );

  const issueMap = new Map(
    reviewIssues.map((issue) => [issue.clientRowId, issue])
  );

  const tbody = document.createElement('tbody');

  for (const course of courses) {
    const row = document.createElement('tr');

    const cells = [
      course.termId,
      course.name,
      course.courseCode ?? '-',
      CATEGORY_LABELS[course.category] ?? course.category,
      course.credits ?? '미확인',
      STATUS_LABELS[course.completionStatus] ?? '확인 필요',
    ];

    for (const value of cells) {
      row.appendChild(createTextElement('td', '', value));
    }

    const matchDisplay = getMatchDisplay(
      course,
      curriculumCourseMap,
      issueMap
    );

    row.appendChild(
      createTextElement(
        'td',
        matchDisplay.className,
        matchDisplay.text
      )
    );

    if (
      course.completionStatus === 'needs_review' ||
      issueMap.has(course.clientRowId)
    ) {
      row.classList.add('klas__row--review');
    }

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);

  return wrapper;
}

function createReviewList(reviewIssues, courses, curriculum) {
  const section = document.createElement('section');
  section.className = 'klas__warnings';

  section.appendChild(
    createTextElement(
      'h3',
      '',
      `매칭 확인이 필요한 과목 (${reviewIssues.length}개)`
    )
  );

  const rowMap = new Map(
    courses.map((course) => [course.clientRowId, course])
  );

  const courseMap = new Map(
    curriculum.courses.map((course) => [course.id, course])
  );

  const list = document.createElement('ul');

  for (const issue of reviewIssues) {
    const row = rowMap.get(issue.clientRowId);
    const name = row?.name ?? issue.clientRowId;
    const reason = REVIEW_LABELS[issue.reason] ?? '확인이 필요합니다.';

    const candidateNames = issue.candidateCourseIds
      .map((id) => courseMap.get(id)?.name)
      .filter(Boolean);

    const candidates =
      candidateNames.length > 0
        ? ` 후보: ${candidateNames.join(', ')}`
        : '';

    list.appendChild(
      createTextElement(
        'li',
        '',
        `${name}: ${reason}${candidates}`
      )
    );
  }

  section.appendChild(list);

  return section;
}

function focusInputLine(lineNumber) {
  const selection = getKlasLineSelection(
    klasTextInput.value,
    lineNumber
  );

  if (!selection) {
    return;
  }

  // 오류가 발생한 줄을 선택하여 수정 위치를 안내합니다.
  klasTextInput.focus();
  klasTextInput.setSelectionRange(
    selection.start,
    selection.end
  );

  klasTextInput.scrollIntoView({
    block: 'center',
  });
}

function createWarnings(warnings) {
  const section = document.createElement('section');
  section.className = 'klas__warnings';

  section.appendChild(
    createTextElement(
      'h3',
      '',
      `입력 내용 확인 필요 (${warnings.length}건)`
    )
  );

  const list = document.createElement('ul');

  for (const warning of warnings) {
    const item = document.createElement('li');

    const reason = getKlasWarningGuidance(warning.reason);

    const description = createTextElement(
      'span',
      '',
      `${warning.lineNumber}번째 줄: ${reason}`
    );

    const jumpButton = document.createElement('button');
    jumpButton.type = 'button';
    jumpButton.className = 'klas__warning-jump';
    jumpButton.textContent = '해당 줄로 이동';

    jumpButton.addEventListener('click', () => {
      focusInputLine(warning.lineNumber);
    });

    item.appendChild(description);
    item.appendChild(jumpButton);
    list.appendChild(item);
  }

  section.appendChild(list);

  return section;
}

function getUnresolvedMajorCourses() {
  if (!activeResult) {
    return [];
  }

  return activeResult.matched.courses.filter(
    (course) =>
      isMajorCourse(course) &&
      course.match.status !== 'exact' &&
      course.match.status !== 'confirmed'
  );
}

function confirmCourseMatch(clientRowId, courseId) {
  if (!activeResult) {
    return;
  }

  const exists = activeResult.curriculum.courses.some(
    (course) => course.id === courseId
  );

  if (!exists) {
    setMessage('교육과정에 없는 과목은 확정할 수 없습니다.', 'error');
    return;
  }

  // 수동 확정 결과를 이전 AI 응답이 덮어쓰지 않도록 합니다.
  cancelPendingAiRequest();

  activeResult.matched = {
    courses: activeResult.matched.courses.map((course) => {
      if (course.clientRowId !== clientRowId) {
        return course;
      }

      return {
        ...course,
        match: {
          status: 'confirmed',
          courseId,
        },
      };
    }),

    reviewIssues: activeResult.matched.reviewIssues.filter(
      (issue) => issue.clientRowId !== clientRowId
    ),
  };

  aiSuggestions.delete(clientRowId);

  renderResults(
    activeResult.parsed,
    activeResult.matched,
    activeResult.curriculum
  );

  setMessage(
    '과목 매칭을 확정했습니다. 이수 상태와 학점 인정 여부는 별도로 검증됩니다.',
    'success'
  );
}

async function requestAiSuggestions() {
  if (!activeResult || aiLoading) {
    return;
  }

  const unmatchedCourses = getUnresolvedMajorCourses()
    .filter((course) => course.match.status === 'unmatched')
    .map((course) => ({
      clientId: course.clientRowId,
      name: course.name,
    }));

  if (unmatchedCourses.length === 0) {
    setMessage('AI 추천이 필요한 미매칭 과목이 없습니다.');
    return;
  }

  const currentVersion = analysisVersion;
  const currentResult = activeResult;

  const controller = new AbortController();
  aiRequestController = controller;

  aiLoading = true;
  aiFeedback = 'AI 추천을 요청하는 중입니다.';

  renderResults(
    currentResult.parsed,
    currentResult.matched,
    currentResult.curriculum
  );

  try {
    const data = await requestAiMatches({
      curriculumId: currentResult.curriculum.curriculumId,
      unmatchedCourses,
      signal: controller.signal,
    });

    if (
      controller.signal.aborted ||
      currentVersion !== analysisVersion ||
      activeResult !== currentResult
    ) {
      return;
    }

    const validCourseIds = new Set(
      currentResult.curriculum.courses.map((course) => course.id)
    );

    const requestedIds = new Set(
      unmatchedCourses.map((course) => course.clientId)
    );

    let suggestedCount = 0;

    for (const result of data.results) {
      if (
        !requestedIds.has(result.clientId) ||
        result.status !== 'suggested' ||
        !Array.isArray(result.candidates)
      ) {
        continue;
      }

      const candidates = result.candidates.filter(
        (candidate) =>
          validCourseIds.has(candidate.courseId) &&
          ['high', 'medium', 'low'].includes(candidate.confidence) &&
          typeof candidate.reason === 'string'
      );

      if (candidates.length === 0) {
        continue;
      }

      const row = currentResult.matched.courses.find(
        (course) => course.clientRowId === result.clientId
      );

      if (!row || row.match.status !== 'unmatched') {
        continue;
      }

      aiSuggestions.set(result.clientId, candidates);

      row.match = {
        status: 'suggested',
        courseId: null,
      };

      suggestedCount += 1;
    }

    aiFeedback =
      `AI가 ${suggestedCount}개 과목에 대한 추천 후보를 찾았습니다. ` +
      '후보를 확인한 뒤 직접 확정해주세요.';
  } catch (error) {
    if (
      !controller.signal.aborted &&
      currentVersion === analysisVersion &&
      activeResult === currentResult
    ) {
      aiFeedback =
        error instanceof Error
          ? error.message
          : 'AI 추천 요청에 실패했습니다. 과목을 직접 선택해주세요.';
    }
  } finally {
    if (aiRequestController === controller) {
      aiRequestController = null;
      aiLoading = false;

      if (
        currentVersion === analysisVersion &&
        activeResult === currentResult
      ) {
        renderResults(
          currentResult.parsed,
          currentResult.matched,
          currentResult.curriculum
        );
      }
    }
  }
}

function createMatchReviewPanel() {
  const section = document.createElement('section');
  section.className = 'klas__review-panel';

  const unresolved = getUnresolvedMajorCourses();

  if (unresolved.length === 0) {
    section.appendChild(
      createTextElement(
        'p',
        'klas__review-complete',
        '자동 매칭되지 않은 전공 과목이 없습니다.'
      )
    );

    return section;
  }

  section.appendChild(
    createTextElement(
      'h3',
      '',
      '3. 과목 매칭 확인'
    )
  );

  section.appendChild(
    createTextElement(
      'p',
      'klas__review-description',
      'AI 추천은 참고용입니다. 추천 후보 또는 교육과정 과목을 직접 선택한 뒤 확정해주세요.'
    )
  );

  const aiButton = document.createElement('button');

  aiButton.type = 'button';
  aiButton.className = 'button button--primary';
  aiButton.textContent = aiLoading
    ? 'AI 추천 요청 중...'
    : 'AI 후보 추천받기';

  aiButton.disabled =
    aiLoading ||
    !unresolved.some((course) => course.match.status === 'unmatched');

  aiButton.addEventListener('click', requestAiSuggestions);

  section.appendChild(aiButton);

  if (aiFeedback) {
    section.appendChild(
      createTextElement(
        'p',
        'klas__review-feedback',
        aiFeedback
      )
    );
  }

  const courseMap = new Map(
    activeResult.curriculum.courses.map(
      (course) => [course.id, course]
    )
  );

  for (const row of unresolved) {
    const item = document.createElement('div');
    item.className = 'klas__review-item';

    item.appendChild(
      createTextElement('h4', '', row.name)
    );

    const select = document.createElement('select');
    select.className = 'klas__review-select';

    select.add(new Option('확정할 과목을 선택하세요.', ''));

    const suggestions = aiSuggestions.get(row.clientRowId) ?? [];

    if (suggestions.length > 0) {
      const suggestedGroup = document.createElement('optgroup');
      suggestedGroup.label = 'AI 추천 후보';

      for (const candidate of suggestions) {
        const matched = courseMap.get(candidate.courseId);

        if (!matched) {
          continue;
        }

        const confidence =
          CONFIDENCE_LABELS[candidate.confidence] ?? '미확인';

        suggestedGroup.appendChild(
          new Option(
            `${matched.name} (확신도: ${confidence})`,
            matched.id
          )
        );
      }

      select.appendChild(suggestedGroup);

      const reasons = document.createElement('ul');
      reasons.className = 'klas__recommendation-reasons';

      for (const candidate of suggestions) {
        const matched = courseMap.get(candidate.courseId);

        if (!matched) {
          continue;
        }

        reasons.appendChild(
          createTextElement(
            'li',
            '',
            `${matched.name}: ${candidate.reason}`
          )
        );
      }

      item.appendChild(reasons);
    }

    const allCoursesGroup = document.createElement('optgroup');
    allCoursesGroup.label = '전체 전공 교육과정';

    for (const course of activeResult.curriculum.courses) {
      allCoursesGroup.appendChild(
        new Option(course.name, course.id)
      );
    }

    select.appendChild(allCoursesGroup);

    const confirmButton = document.createElement('button');

    confirmButton.type = 'button';
    confirmButton.className = 'button';
    confirmButton.textContent = '선택한 과목 확정';
    confirmButton.disabled = true;

    select.addEventListener('change', () => {
      confirmButton.disabled = !select.value;
    });

    confirmButton.addEventListener('click', () => {
      if (!select.value) {
        return;
      }

      confirmCourseMatch(row.clientRowId, select.value);
    });

    const controls = document.createElement('div');
    controls.className = 'klas__review-controls';

    controls.appendChild(select);
    controls.appendChild(confirmButton);

    item.appendChild(controls);
    section.appendChild(item);
  }

  return section;
}

function createMakerPlanPanel() {
  const section = document.createElement('section');
  section.className = 'klas__plan-panel';

  section.appendChild(
    createTextElement(
      'h3',
      '',
      '4. 커리메이커 전달 데이터'
    )
  );

  section.appendChild(
    createTextElement(
      'p',
      'klas__plan-description',
      '확정된 과목과 이수 학점을 정리하여 커리메이커에서 사용할 JSON을 생성합니다.'
    )
  );

  const previewButton = document.createElement('button');

  previewButton.type = 'button';
  previewButton.className = 'button button--primary';
  previewButton.textContent = '이수내역 정리 결과 확인';

  const output = document.createElement('div');
  output.className = 'klas__plan-output';
  output.hidden = true;

  previewButton.addEventListener('click', () => {
    if (!activeResult) {
      setMessage('먼저 KLAS 이수내역을 분석해주세요.', 'error');
      return;
    }

    try {
      const result = buildMakerPlan(
        activeResult.matched.courses,
        activeResult.curriculum
      );

      const { plan, reviewPendingRowIds } = result;

      // 파싱 경고와 수강 기록 확인 필요 항목을 분리하여 판단합니다.
      const safety = getHandoffSafetyState({
        warnings: activeResult.parsed.warnings,
        reviewPendingCount: plan.reviewPendingCount,
      });

      output.replaceChildren();

      const majorCredits = plan.completedCourses.reduce(
        (sum, course) => sum + course.earnedCredits,
        0
      );

      const otherCredits = Object.values(
        plan.otherEarnedCredits
      ).reduce((sum, credits) => sum + credits, 0);

      const summary = document.createElement('div');
      summary.className = 'klas__plan-summary';

      const summaryItems = [
        `전공 이수 완료: ${plan.completedCourses.length}과목`,
        `전공 취득 학점: ${majorCredits}학점`,
        `전공 외 취득 학점: ${otherCredits}학점`,
        `현재 수강 중: ${plan.inProgressCourses.length}과목`,
      ];

      for (const item of summaryItems) {
        summary.appendChild(
          createTextElement('span', 'klas__summary-item', item)
        );
      }

      // 수강 기록 확인 필요 건수
      summary.appendChild(
        createTextElement(
          'span',
          safety.hasReviewPending
            ? 'klas__summary-item klas__summary-item--warning'
            : 'klas__summary-item',
          `수강 기록 확인 필요: ${safety.reviewPendingCount}건`
        )
      );

      // 파싱 경고 건수
      summary.appendChild(
        createTextElement(
          'span',
          safety.hasParsingWarnings
            ? 'klas__summary-item klas__summary-item--warning'
            : 'klas__summary-item',
          `파싱 경고: ${safety.parsingWarningCount}건`
        )
      );

      output.appendChild(summary);

      if (safety.hasParsingWarnings) {
        output.appendChild(
          createTextElement(
            'p',
            'klas__plan-warning',
            `파싱 경고 ${safety.parsingWarningCount}건이 남아 있습니다. ` +
            '일부 입력이 분석에서 제외되었거나 추가 확인이 ' +
            '필요할 수 있습니다. 위의 입력 내용 확인 필요 ' +
            '목록을 확인해주세요. 정상 인식된 과목은 유지됩니다.'
          )
        );
      }

      if (safety.hasReviewPending) {
        output.appendChild(
          createTextElement(
            'p',
            'klas__plan-warning',
            '아직 확인이 필요한 수강 기록이 있습니다. ' +
            '미확정 항목은 취득 학점에 포함되지 않았습니다.'
          )
        );

        const rowMap = new Map(
          activeResult.matched.courses.map(
            (row) => [row.clientRowId, row]
          )
        );

        const pendingList = document.createElement('ul');
        pendingList.className = 'klas__plan-pending';

        for (const rowId of reviewPendingRowIds) {
          const row = rowMap.get(rowId);

          if (!row) {
            continue;
          }

          pendingList.appendChild(
            createTextElement(
              'li',
              '',
              `${row.name} (${row.termId}) — 확인 필요`
            )
          );
        }

        output.appendChild(pendingList);
      }

      // 모든 경고가 해결된 경우에만 정상 완료 안내를 표시합니다.
      if (safety.isFullyReviewed) {
        output.appendChild(
          createTextElement(
            'p',
            'klas__plan-success',
            '파싱 경고와 미확정 수강 기록 없이 ' +
            '데이터가 정리되었습니다.'
          )
        );
      }

      output.appendChild(
        createTextElement(
          'h4',
          '',
          '커리메이커 전달 JSON'
        )
      );

      const jsonText = JSON.stringify(plan, null, 2);

      const jsonPreview = createTextElement(
        'pre',
        'klas__plan-json',
        jsonText
      );

      output.appendChild(jsonPreview);

      const copyButton = document.createElement('button');

      copyButton.type = 'button';
      copyButton.className = 'button';
      copyButton.textContent = 'JSON 복사';

      copyButton.addEventListener('click', async () => {
        const shouldProceed = confirmHandoffWithUser(
          safety,
          (confirmationMessage) => window.confirm(confirmationMessage)
        );

        if (!shouldProceed) {
          return;
        }

        try {
          await navigator.clipboard.writeText(jsonText);

          setMessage(
            '커리메이커 전달용 JSON을 복사했습니다.',
            'success'
          );
        } catch {
          setMessage(
            '자동 복사에 실패했습니다. JSON을 직접 선택해 복사해주세요.',
            'error'
          );
        }
      });

      output.appendChild(copyButton);

      const makerButton = document.createElement('button');

      makerButton.type = 'button';
      makerButton.className = 'button button--primary';
      makerButton.textContent = '커리메이커에 반영하기';

      makerButton.addEventListener('click', () => {
        // 기존 파싱 경고 및 미확정 기록 확인 절차 유지
        const shouldProceed = confirmHandoffWithUser(
          safety,
          (confirmationMessage) => window.confirm(confirmationMessage)
        );

        if (!shouldProceed) {
          return;
        }

        try {
          // 수강 계획과 입학년도 정보를 별도로 안전하게 저장합니다.
          saveMakerTransfer(window.sessionStorage, {
            plan,
            curriculum: activeResult.curriculum,
            admissionYear: admissionYearInput.value,
          });

          window.location.assign('/maker/');
        } catch {
          setMessage(
            '입학년도 또는 수강 계획을 전달하지 못했습니다. ' +
            '교육과정과 입학년도를 다시 확인해주세요.',
            'error'
          );
        }
      });

      output.appendChild(makerButton);

      output.hidden = false;
    } catch {
      output.hidden = true;

      setMessage(
        '이수내역을 정리하지 못했습니다. 입력 데이터와 매칭 결과를 확인해주세요.',
        'error'
      );
    }
  });

  section.appendChild(previewButton);
  section.appendChild(output);

  return section;
}

function renderResults(parsed, matched, curriculum) {
  const courses = matched.courses;
  const reviewIssues = matched.reviewIssues;

  resultsContainer.replaceChildren();

  const appliedYears = curriculum.admissionYears
    .map((year) => `${year}학번`)
    .join(', ');

  resultsContainer.appendChild(
    createTextElement(
      'p',
      'klas__result-scope',
      `${curriculum.department.name} · ` +
      `${curriculum.catalogYear}학년도 기준 교육과정 ` +
      `(적용 입학년도: ${appliedYears})으로 분석했습니다. ` +
      '수강 시기에 따라 과목명, 학점 및 이수구분이 다를 수 있습니다. ' +
      '실제 졸업요건은 학교의 공식 학사 자료와 함께 확인해주세요.'
    )
  );

  resultsContainer.appendChild(
    createSummary(courses, reviewIssues, parsed.warnings)
  );

  resultsContainer.appendChild(
    createCourseTable(courses, curriculum, reviewIssues)
  );

  if (activeResult) {
    resultsContainer.appendChild(
        createMatchReviewPanel()
    );
  }

  if (reviewIssues.length > 0) {
    resultsContainer.appendChild(
      createReviewList(reviewIssues, courses, curriculum)
    );
  }

  if (parsed.warnings.length > 0) {
    resultsContainer.appendChild(
      createWarnings(parsed.warnings)
    );
  }

  if (activeResult) {
    resultsContainer.appendChild(
      createMakerPlanPanel()
    );
  }

  preview.hidden = false;
}

async function handleSubmit(event) {
  event.preventDefault();

  cancelPendingAiRequest();

  const rawText = klasTextInput.value;
  const currentTermId = currentTermInput.value.trim();

  const inputHint = getKlasInputHint(rawText, currentTermId);

  if (inputHint) {
    setMessage(inputHint, 'error');
    return;
  }

  if (!curriculumSelect.value) {
    setMessage('교육과정을 선택해주세요.', 'error');
    return;
  }

  const admissionSupport = getSelectedAdmissionSupport();

  if (admissionSupport?.status !== 'supported') {
    setMessage(
      '입학년도와 교육과정의 지원 범위를 확인해주세요. ' +
      '지원되지 않는 학번은 분석할 수 없습니다.',
      'error'
    );
    return;
  }

  clearResults();

  let parsed;

  try {
    parsed = parseKlasText(rawText, { currentTermId });

    if (
      !parsed ||
      !Array.isArray(parsed.courses) ||
      !Array.isArray(parsed.warnings)
    ) {
      throw new Error('잘못된 파싱 결과');
    }
  } catch {
    setMessage(
      'KLAS 텍스트를 분석하지 못했습니다. 입력 형식을 확인해주세요.',
      'error'
    );
    return;
  }

  if (parsed.courses.length === 0) {
    // 인식한 과목이 없어도 경고 목록은 표시합니다.
    if (parsed.warnings.length > 0) {
      resultsContainer.replaceChildren(
        createWarnings(parsed.warnings)
      );

      preview.hidden = false;

      setMessage(
        '인식된 과목이 없습니다. 아래 경고에서 문제가 있는 ' +
        '줄을 확인한 후 다시 분석해주세요.',
        'error'
      );
    } else {
      setMessage(
        '인식된 과목이 없습니다. 학기 제목과 과목 정보를 ' +
        '함께 복사했는지 확인해주세요.',
        'error'
      );
    }

    return;
  }

  const currentVersion = ++analysisVersion;

  analyzeButton.disabled = true;
  analyzeButton.textContent = '분석 중...';

  setMessage('교육과정을 조회하고 과목을 매칭하는 중입니다.');

  try {
    const curriculum = await loadSelectedCurriculum();

    if (currentVersion !== analysisVersion) {
      return;
    }

    // 실제 교육과정 상세 데이터의 적용 학번도 확인합니다.
    const verifiedSupport = getAdmissionYearSupport({
      admissionYear: admissionYearInput.value,
      admissionYears: curriculum.admissionYears,
    });

    if (verifiedSupport.status !== 'supported') {
      setMessage(
        '선택한 입학년도는 해당 교육과정의 지원 대상이 아닙니다.',
        'error'
      );
      return;
    }


    // 교양 과목은 전공 교육과정 매칭에서 제외합니다.
    const majorRows = parsed.courses.filter(isMajorCourse);

    const majorMatchResult = matchParsedCourses(
      majorRows,
      curriculum
    );

    const matchedRowMap = new Map(
      majorMatchResult.courses.map((course) => [
        course.clientRowId,
        course,
      ])
    );

    // 전공·교양을 포함한 원래 과목 순서를 유지합니다.
    const matched = {
      courses: parsed.courses.map(
        (course) =>
          matchedRowMap.get(course.clientRowId) ?? course
      ),
      reviewIssues: majorMatchResult.reviewIssues,
    };

    aiSuggestions.clear();
    aiFeedback = '';

    activeResult = {
      parsed,
      matched,
      curriculum,
    };

    renderResults(parsed, matched, curriculum);

    const exactCount = matched.courses.filter(
      (course) => course.match.status === 'exact'
    ).length;

    setMessage(
      `총 ${matched.courses.length}개 과목을 추출하고 ` +
      `${exactCount}개 전공 과목을 자동 매칭했습니다. ` +
      '매칭 결과는 아직 최종 확정되지 않았습니다.',
      'success'
    );
  } catch {
    if (currentVersion === analysisVersion) {
      setMessage(
        '과목은 추출했지만 교육과정 조회 또는 매칭에 실패했습니다. 다시 시도해주세요.',
        'error'
      );
    }
  } finally {
    if (currentVersion === analysisVersion) {
      analyzeButton.textContent = '과목 분석 및 매칭';
      refreshAnalyzeButton();
    }
  }
}

function clearInput() {
  klasTextInput.value = '';
  updateInputState();
  klasTextInput.focus();
}

form.addEventListener('submit', handleSubmit);

klasTextInput.addEventListener('input', handleInputChange);
currentTermInput.addEventListener('input', handleInputChange);
curriculumSelect.addEventListener('change', updateInputState);
admissionYearInput.addEventListener('input', updateInputState);

clearButton.addEventListener('click', clearInput);
sampleButton.addEventListener('click', fillSampleInput);

setDefaultCurrentTerm();
loadCurricula();
