import { parseKlasText } from './parser.js';
import { matchParsedCourses } from './matcher.js';

const form = document.getElementById('klas-form');
const curriculumSelect = document.getElementById('curriculum-id');
const currentTermInput = document.getElementById('current-term');
const klasTextInput = document.getElementById('klas-text');

const textCount = document.getElementById('text-count');
const analyzeButton = document.getElementById('analyze-button');
const clearButton = document.getElementById('clear-button');
const message = document.getElementById('klas-message');

const preview = document.getElementById('klas-preview');
const resultsContainer = document.getElementById('klas-results');

const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;
const curriculumDepartments = new Map();

let analysisVersion = 0;

let activeResult = null;
let aiLoading = false;
let aiFeedback = '';

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

const WARNING_LABELS = {
  ROW_FORMAT_INVALID: '과목 행의 형식을 인식하지 못했습니다.',
  TERM_NOT_FOUND: '소속 학기를 확인하지 못했습니다.',
  COURSE_INFORMATION_INCOMPLETE: '과목 정보가 불완전합니다.',
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

function refreshAnalyzeButton() {
  const hasText = klasTextInput.value.trim().length > 0;
  const hasCurriculum = curriculumSelect.value !== '';
  const validTerm = TERM_PATTERN.test(currentTermInput.value.trim());

  analyzeButton.disabled = !(hasText && hasCurriculum && validTerm);
}

function updateInputState() {
  analysisVersion += 1;

  activeResult = null;
  aiLoading = false;
  aiFeedback = '';
  aiSuggestions.clear();

  textCount.textContent =
    `${klasTextInput.value.length.toLocaleString()}자 입력`;

  analyzeButton.textContent = '과목 분석 및 매칭';

  refreshAnalyzeButton();
  clearResults();
  setMessage('');
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

function createWarnings(warnings) {
  const section = document.createElement('section');
  section.className = 'klas__warnings';

  section.appendChild(
    createTextElement(
      'h3',
      '',
      `파싱 경고 (${warnings.length}건)`
    )
  );

  const list = document.createElement('ul');

  for (const warning of warnings) {
    const reason =
      WARNING_LABELS[warning.reason] ??
      '해당 줄의 내용을 확인해주세요.';

    list.appendChild(
      createTextElement(
        'li',
        '',
        `${warning.lineNumber}번째 줄: ${reason}`
      )
    );
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

  aiLoading = true;
  aiFeedback = 'AI 추천을 요청하는 중입니다.';

  renderResults(
    currentResult.parsed,
    currentResult.matched,
    currentResult.curriculum
  );

  try {
    const response = await fetch('/api/ai/match-courses', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        schemaVersion: 1,
        curriculumId: currentResult.curriculum.curriculumId,
        unmatchedCourses,
      }),
    });

    if (!response.ok) {
      if (response.status === 503) {
        throw new Error(
          'AI 서비스를 사용할 수 없습니다. 아래에서 과목을 직접 선택해주세요.'
        );
      }

      throw new Error(
        'AI 추천 요청에 실패했습니다. 과목을 직접 선택할 수 있습니다.'
      );
    }

    const data = await response.json();

    if (data.schemaVersion !== 1 || !Array.isArray(data.results)) {
      throw new Error('AI 응답 형식이 올바르지 않습니다.');
    }

    if (
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
      currentVersion === analysisVersion &&
      activeResult === currentResult
    ) {
      aiFeedback = error.message;
    }
  } finally {
    if (
      currentVersion === analysisVersion &&
      activeResult === currentResult
    ) {
      aiLoading = false;

      renderResults(
        currentResult.parsed,
        currentResult.matched,
        currentResult.curriculum
      );
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

function renderResults(parsed, matched, curriculum) {
  const courses = matched.courses;
  const reviewIssues = matched.reviewIssues;

  resultsContainer.replaceChildren();

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

  preview.hidden = false;
}

async function handleSubmit(event) {
  event.preventDefault();

  const rawText = klasTextInput.value;
  const currentTermId = currentTermInput.value.trim();

  if (!rawText.trim()) {
    setMessage('KLAS 성적조회 텍스트를 입력해주세요.', 'error');
    return;
  }

  if (!TERM_PATTERN.test(currentTermId)) {
    setMessage('현재 학기 형식을 확인해주세요.', 'error');
    return;
  }

  if (!curriculumSelect.value) {
    setMessage('교육과정을 선택해주세요.', 'error');
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
    setMessage(
      '인식된 과목이 없습니다. 학기 제목과 과목 정보를 확인해주세요.',
      'error'
    );
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

klasTextInput.addEventListener('input', updateInputState);
currentTermInput.addEventListener('input', updateInputState);
curriculumSelect.addEventListener('change', updateInputState);

clearButton.addEventListener('click', clearInput);

setDefaultCurrentTerm();
loadCurricula();