import { consumeMakerHandoff } from '../klas/handoff.js';
const departmentSelect = document.getElementById("department-select");
const curriculumSelect = document.getElementById("curriculum-select");
const curriculumNotice = document.getElementById("curriculum-notice");
const courseSearch = document.getElementById("course-search");
const courseSelect = document.getElementById("course-select");

// 현재 선택한 학과 및 교육과정 데이터
let departments = [];
let currentCurriculum = null;
let currentPlan = null;

let pendingMakerPlan = null;

try {
  pendingMakerPlan = consumeMakerHandoff(
    window.sessionStorage
  );
} catch {
  pendingMakerPlan = null;
}

// 이수구분을 한국어로 표시
const CATEGORY_NAMES = {
  major_required: "전공필수",
  major_elective: "전공선택",
  general_required: "교양필수",
  general_elective: "교양선택",
  foundation_required: "기초필수",
  foundation_elective: "기초선택",
  free_elective: "일반선택",
  unknown: "확인 필요",
};

// API에서 JSON 데이터 가져오기
async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`서버 요청 실패: HTTP ${response.status}`);
  }

  return response.json();
}

// 1. 학과 목록 불러오기
async function loadDepartments() {
  try {
    const data = await fetchJSON("/api/departments");

    departments = data.departments;

    departmentSelect.replaceChildren();

    for (const department of departments) {
      departmentSelect.add(
        new Option(department.name, department.id)
      );
    }

    if (departments.length === 0) {
      departmentSelect.add(new Option("등록된 학과 없음", ""));
      curriculumNotice.textContent = "등록된 교육과정이 없습니다.";
      return;
    }

    const matchingDepartment = pendingMakerPlan
      ? departments.find((department) =>
          department.curricula.some(
            (curriculum) =>
              curriculum.id === pendingMakerPlan.curriculumId
          )
        )
      : null;

    const unavailableCurriculumId =
      pendingMakerPlan && !matchingDepartment
        ? pendingMakerPlan.curriculumId
        : null;

    departmentSelect.value = matchingDepartment
      ? matchingDepartment.id
      : departments[0].id;

    updateCurriculumOptions();

    if (matchingDepartment) {
      curriculumSelect.value = pendingMakerPlan.curriculumId;
    } else if (unavailableCurriculumId) {
      pendingMakerPlan = null;
    }

    await loadCurriculum();

    if (unavailableCurriculumId) {
      showFeedback(
        `교육과정 ${unavailableCurriculumId}을 찾지 못해 ` +
        'KLAS 이수내역을 반영하지 못했습니다.',
        true
      );
    }
  } catch (error) {
    curriculumNotice.textContent =
      "학과 정보를 불러오지 못했습니다: " + error.message;
  }
}

// 2. 선택한 학과의 교육과정 목록 표시
function updateCurriculumOptions() {
  const department = departments.find(
    item => item.id === departmentSelect.value
  );

  curriculumSelect.replaceChildren();

  if (!department) {
    return;
  }

  for (const curriculum of department.curricula) {
    const label = `${curriculum.catalogYear} 교육과정`;

    curriculumSelect.add(
      new Option(label, curriculum.id)
    );
  }

  curriculumSelect.value = department.defaultCurriculumId;
}

// 3. 교육과정의 과목 데이터 불러오기
async function loadCurriculum() {
  const departmentId = departmentSelect.value;
  const curriculumId = curriculumSelect.value;

  currentCurriculum = null;
  currentPlan = null;
  resetOtherCreditInputs();
  renderPlan();
  renderCreditSummary(null);
  courseSelect.replaceChildren();
  courseSelect.add(new Option("과목을 선택하세요", ""));

  if (!departmentId || !curriculumId) {
    return;
  }

  try {
    const url =
      `/api/curriculum/${encodeURIComponent(departmentId)}` +
      `?curriculumId=${encodeURIComponent(curriculumId)}`;

    const curriculum = await fetchJSON(url);

    if (
      departmentSelect.value !== departmentId ||
      curriculumSelect.value !== curriculumId
    ) {
      return;
    }

    currentCurriculum = curriculum;
    currentPlan = createBrowserPlan(curriculum.curriculumId);

    let importedValidation = null;
    let importError = null;

    if (
      pendingMakerPlan &&
      pendingMakerPlan.curriculumId === curriculum.curriculumId
    ) {
      const importedPlan = pendingMakerPlan;

      pendingMakerPlan = null;

      try {
        const response = await fetch('/api/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(importedPlan),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message ??
            '전달된 수강 계획을 검증하지 못했습니다.'
          );
        }

        if (
          departmentSelect.value !== departmentId ||
          curriculumSelect.value !== curriculumId
        ) {
          return;
        }

        currentPlan = importedPlan;
        importedValidation = result;

        for (const [category, inputId] of Object.entries(
          OTHER_CREDIT_FIELDS
        )) {
          const input = document.getElementById(inputId);

          input.value = String(
            importedPlan.otherEarnedCredits[category]
          );
        }
      } catch (error) {
        importError = error.message;
      }
    }

    curriculumNotice.textContent = curriculum.isDemo
      ? "개발용 예시 교육과정입니다. 실제 졸업요건과 다를 수 있습니다."
      : `${curriculum.department.name} 교육과정을 불러왔습니다.`;

    renderCourseOptions();
    renderPlan();

    renderCreditSummary(
      importedValidation?.summary ?? null
    );

    validationResult.replaceChildren();

    if (importedValidation) {
      renderValidationResult(importedValidation);

      showFeedback(
        'KLAS 이수내역이 커리메이커에 반영되었습니다.',
        false
      );
    } else if (importError) {
      showFeedback(
        `KLAS 이수내역 반영 실패: ${importError}`,
        true
      );
    }
  } catch (error) {
    curriculumNotice.textContent =
      "교육과정을 불러오지 못했습니다: " + error.message;
  }
}

// 4. 과목 검색 및 선택 목록 표시
function renderCourseOptions() {
  courseSelect.replaceChildren();
  courseSelect.add(new Option("과목을 선택하세요", ""));

  if (!currentCurriculum) {
    return;
  }

  const keyword = courseSearch.value.trim().toLowerCase();

  const filteredCourses = currentCurriculum.courses.filter(course => {
    const names = [
      course.name,
      ...course.aliases,
      ...course.courseCodes,
    ];

    return names.some(name =>
      name.toLowerCase().includes(keyword)
    );
  });

  for (const course of filteredCourses) {
    const category = CATEGORY_NAMES[course.category] ?? "기타";

    const label =
      `${course.name} (${category}, ${course.credits}학점)`;

    courseSelect.add(new Option(label, course.id));
  }

  if (filteredCourses.length === 0) {
    courseSelect.add(new Option("검색 결과가 없습니다", ""));
  }
}

// 학과를 변경한 경우
departmentSelect.addEventListener("change", async () => {
  updateCurriculumOptions();
  await loadCurriculum();
});

// 교육과정을 변경한 경우
curriculumSelect.addEventListener("change", loadCurriculum);

// 검색어를 입력한 경우
courseSearch.addEventListener("input", renderCourseOptions);

// 페이지 실행 시 학과 목록 불러오기
loadDepartments();

const courseForm = document.getElementById("course-form");
const statusSelect = document.getElementById("course-status");
const termInput = document.getElementById("term-input");
const earnedField = document.getElementById("earned-field");
const earnedInput = document.getElementById("earned-input");
const feedback = document.getElementById("maker-feedback");

const completedList = document.getElementById("completed-course-list");
const inProgressList = document.getElementById("in-progress-course-list");
const plannedList = document.getElementById("planned-terms-list");

const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;

// 계약서에 맞는 빈 수강 계획 생성
function createBrowserPlan(curriculumId) {
  return {
    schemaVersion: 1,
    curriculumId,
    completedCourses: [],
    inProgressCourses: [],
    otherEarnedCredits: {
      general_required: 0,
      general_elective: 0,
      foundation_required: 0,
      foundation_elective: 0,
      free_elective: 0,
    },
    plannedTerms: [],
    reviewPendingCount: 0,
  };
}

// 수강 상태에 따라 인정 학점 입력창 표시
function updateEarnedField() {
  const isCompleted = statusSelect.value === "completed";

  earnedField.hidden = !isCompleted;
  earnedInput.required = isCompleted;
}

statusSelect.addEventListener("change", updateEarnedField);
updateEarnedField();

// 사용자에게 안내 메시지 표시
function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.style.color = isError
    ? "var(--color-error)"
    : "var(--color-ok)";
}

// 과목 ID로 교육과정 과목 찾기
function findCourse(courseId) {
  return currentCurriculum?.courses.find(
    course => course.id === courseId
  );
}

// 과목 카드 생성
function createCourseCard(course, description) {
  const card = document.createElement("div");
  card.className = "maker-course-card";

  const info = document.createElement("div");
  info.className = "maker-course-info";

  const name = document.createElement("strong");
  name.textContent = course.name;

  const detail = document.createElement("small");
  detail.textContent = description;

  info.append(name, detail);
  card.append(info);

  return card;
}

// 이수 완료 및 수강 중 과목 표시

function renderSimpleList(container, items, emptyMessage, status) {
  container.replaceChildren();

  if (items.length === 0) {
    const message = document.createElement("p");
    message.textContent = emptyMessage;
    container.append(message);
    return;
  }

  for (const item of items) {
    const course = findCourse(item.courseId);

    if (!course) continue;

    const credits = item.earnedCredits ?? course.credits;
    const description = `${item.termId} · ${credits}학점`;

    // 기존 과목 카드 생성
    const card = createCourseCard(course, description);

    // 삭제 버튼 생성
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button button--quiet";
    removeButton.textContent = "삭제";
    removeButton.setAttribute(
      "aria-label",
      `${course.name} 삭제`
    );

    // 삭제 버튼 클릭 이벤트
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;

      try {
        await removeRecordedCourse(status, item.courseId);
      } catch (error) {
        showFeedback(error.message, true);
        removeButton.disabled = false;
      }
    });

    card.append(removeButton);
    container.append(card);
  }
}


// 학기별 수강 계획 표시
function renderPlan() {
  if (!currentPlan || !currentCurriculum) {
    completedList.textContent = "등록된 과목이 없습니다.";
    inProgressList.textContent = "등록된 과목이 없습니다.";
    plannedList.textContent = "등록된 수강 계획이 없습니다.";
    return;
  }


 renderSimpleList(
  completedList,
  currentPlan.completedCourses,
  "이수 완료한 과목이 없습니다.",
  "completed"
 );

 renderSimpleList(
  inProgressList,
  currentPlan.inProgressCourses,
  "현재 수강 중인 과목이 없습니다.",
  "in_progress"
 );


  plannedList.replaceChildren();

  if (currentPlan.plannedTerms.length === 0) {
    plannedList.textContent = "아직 등록된 수강 계획이 없습니다.";
    return;
  }

  const termRank = { "1": 0, S: 1, "2": 2, W: 3 };

  const sortedTerms = [...currentPlan.plannedTerms].sort((a, b) => {
    const [yearA, semesterA] = a.termId.split("-");
    const [yearB, semesterB] = b.termId.split("-");

    return Number(yearA) - Number(yearB)
      || termRank[semesterA] - termRank[semesterB];
  });

  for (const term of sortedTerms) {
    const termCard = document.createElement("div");
    termCard.className = "maker-term-card";

    const title = document.createElement("h3");
    title.textContent = term.termId;
    termCard.append(title);

    for (const courseId of term.courseIds) {
      const course = findCourse(courseId);

      if (!course) continue;

      const description =
        `${CATEGORY_NAMES[course.category] ?? "기타"} · ${course.credits}학점`;


      const card = createCourseCard(course, description);

      // 삭제 버튼 생성
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "button button--quiet";
      removeButton.textContent = "삭제";
      removeButton.setAttribute(
        "aria-label",
        `${course.name} 수강 계획에서 삭제`
     );

     // 삭제 버튼 클릭 이벤트
     removeButton.addEventListener("click", async () => {
     removeButton.disabled = true;

     try {
     await removePlannedCourse(term.termId, courseId);
     } catch (error) {
     showFeedback(error.message, true);
     removeButton.disabled = false;
     }
     });


     // 학기 이동 버튼 생성
     const moveButton = document.createElement("button");
     moveButton.type = "button";
     moveButton.className = "button";
     moveButton.textContent = "학기 이동";
     moveButton.setAttribute(
       "aria-label",
       `${course.name} 다른 학기로 이동`
      );

     // 학기 이동 버튼 클릭
     moveButton.addEventListener("click", async () => {
      const input = window.prompt(
        "이동할 학기를 입력하세요. (예: 2027-2)",
        "2027-2"
      );

      // 취소를 누른 경우
      if (input === null) {
        return;
      }

      const toTermId = input.trim();

      // 학기 형식 확인
      if (!TERM_PATTERN.test(toTermId)) {
        showFeedback(
          "학기는 2027-2와 같은 형식으로 입력해 주세요.",
          true
        );
        return;
      }

      // 동일 학기로 이동 방지
      if (toTermId === term.termId) {
        showFeedback("이미 해당 학기에 등록되어 있습니다.", true);
        return;
      }

      moveButton.disabled = true;

      try {
        await movePlannedCourse(
          term.termId,
          toTermId,
          courseId
        );
      } catch (error) {
        showFeedback(error.message, true);
        moveButton.disabled = false;
      }
      });

      // 이동 버튼과 삭제 버튼을 함께 표시
      const actions = document.createElement("div");
      actions.className = "maker-course-actions";

      actions.append(moveButton, removeButton);
      card.append(actions);
      termCard.append(card);


    }

    plannedList.append(termCard);
  }
}

// 서버가 계산한 학점 결과 표시
function renderCreditSummary(summary) {
  const fields = {
    "earned-credits": summary?.earnedTotalCredits ?? 0,
    "in-progress-credits": summary?.inProgressCredits ?? 0,
    "planned-credits": summary?.plannedCredits ?? 0,
    "projected-credits": summary?.projectedTotalCredits ?? 0,
  };

  for (const [id, value] of Object.entries(fields)) {
    document.getElementById(id).textContent = value;
  }
}

// 수강 과목 추가 버튼 처리
courseForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentCurriculum || !currentPlan) {
    showFeedback("교육과정을 먼저 선택해 주세요.", true);
    return;
  }

  const courseId = courseSelect.value;
  const termId = termInput.value.trim();
  const status = statusSelect.value;
  const course = findCourse(courseId);

  if (!course) {
    showFeedback("추가할 과목을 선택해 주세요.", true);
    return;
  }

  if (!TERM_PATTERN.test(termId)) {
    showFeedback("학기는 2027-1과 같은 형식으로 입력해 주세요.", true);
    return;
  }

  const usedIds = [
    ...currentPlan.completedCourses.map(item => item.courseId),
    ...currentPlan.inProgressCourses.map(item => item.courseId),
    ...currentPlan.plannedTerms.flatMap(term => term.courseIds),
  ];

  if (usedIds.includes(courseId)) {
    showFeedback("이미 등록된 과목입니다.", true);
    return;
  }

  // 기존 계획을 직접 바꾸지 않고 복사
  const nextPlan = structuredClone(currentPlan);

  if (status === "completed") {
    if (earnedInput.value.trim() === "") {
      showFeedback("실제 인정 학점을 입력해 주세요.", true);
      return;
    }

    const earnedCredits = Number(earnedInput.value);

    if (!Number.isFinite(earnedCredits) || earnedCredits < 0) {
      showFeedback("올바른 인정 학점을 입력해 주세요.", true);
      return;
    }

    nextPlan.completedCourses.push({
      courseId,
      termId,
      earnedCredits,
    });

  } else if (status === "in_progress") {
    nextPlan.inProgressCourses.push({
      courseId,
      termId,
    });

  } else if (status === "planned") {
    let term = nextPlan.plannedTerms.find(
      item => item.termId === termId
    );

    if (!term) {
      term = { termId, courseIds: [] };
      nextPlan.plannedTerms.push(term);
    }

    term.courseIds.push(courseId);
  } else {
    showFeedback("수강 상태가 올바르지 않습니다.", true);
    return;
  }

  const submitButton = courseForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;

  try {
    // 서버 검증 후 수강 계획 반영
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextPlan),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message ?? "수강 계획을 검증하지 못했습니다."
      );
    }

    // 요청 중 교육과정이 변경되었다면 이전 결과 무시
    if (currentCurriculum?.curriculumId !== nextPlan.curriculumId) {
      return;
    }

    currentPlan = nextPlan;

    renderPlan();
    renderCreditSummary(result.summary);

    renderValidationResult(result);

    showFeedback(`${course.name} 과목이 등록되었습니다.`);

    courseForm.reset();
    updateEarnedField();

  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

async function removePlannedCourse(termId, courseId) {
  if (!currentPlan || !currentCurriculum) {
    throw new Error("교육과정을 먼저 선택해 주세요.");
  }

  // 기존 수강 계획 복사
  const originalPlan = currentPlan;
  const nextPlan = structuredClone(originalPlan);

  // 삭제할 과목이 들어 있는 학기 찾기
  const targetTerm = nextPlan.plannedTerms.find(
    term => term.termId === termId
  );

  if (!targetTerm || !targetTerm.courseIds.includes(courseId)) {
    throw new Error("삭제할 과목을 찾을 수 없습니다.");
  }

  // 해당 학기에서 과목 삭제
  targetTerm.courseIds = targetTerm.courseIds.filter(
    id => id !== courseId
  );

  // 과목이 하나도 남지 않은 학기 제거
  nextPlan.plannedTerms = nextPlan.plannedTerms.filter(
    term => term.courseIds.length > 0
  );

  // 변경된 수강 계획을 서버에서 검증
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextPlan),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "수강 계획 삭제에 실패했습니다."
    );
  }

  // 검증 도중 다른 변경이 발생했다면 이전 응답을 적용하지 않음
  if (
    currentPlan !== originalPlan ||
    currentCurriculum?.curriculumId !== nextPlan.curriculumId
  ) {
    throw new Error("수강 계획이 변경되었습니다. 다시 시도해 주세요.");
  }

  // 검증에 성공하면 변경된 계획 반영
  currentPlan = nextPlan;

  // 화면과 학점 갱신
  renderPlan();
  renderCreditSummary(result.summary);

  renderValidationResult(result);

  showFeedback("수강 예정 과목이 삭제되었습니다.");
}

async function movePlannedCourse(fromTermId, toTermId, courseId) {
  if (!currentPlan || !currentCurriculum) {
    throw new Error("교육과정을 먼저 선택해 주세요.");
  }

  if (!TERM_PATTERN.test(fromTermId) ||
      !TERM_PATTERN.test(toTermId)) {
    throw new Error("학기 형식이 올바르지 않습니다.");
  }

  if (fromTermId === toTermId) {
    throw new Error("같은 학기로 이동할 수 없습니다.");
  }

  // 현재 수강 계획 복사
  const originalPlan = currentPlan;
  const nextPlan = structuredClone(originalPlan);

  // 이동 전 학기 검색
  const sourceTerm = nextPlan.plannedTerms.find(
    term => term.termId === fromTermId
  );

  if (!sourceTerm || !sourceTerm.courseIds.includes(courseId)) {
    throw new Error("이동할 과목을 찾을 수 없습니다.");
  }

  // 기존 학기에서 과목 제거
  sourceTerm.courseIds = sourceTerm.courseIds.filter(
    id => id !== courseId
  );

  // 빈 학기 제거
  nextPlan.plannedTerms = nextPlan.plannedTerms.filter(
    term => term.courseIds.length > 0
  );

  // 이동할 학기 찾기
  let targetTerm = nextPlan.plannedTerms.find(
    term => term.termId === toTermId
  );

  // 이동할 학기가 없으면 새로 생성
  if (!targetTerm) {
    targetTerm = {
      termId: toTermId,
      courseIds: [],
    };

    nextPlan.plannedTerms.push(targetTerm);
  }

  // 새로운 학기에 과목 추가
  targetTerm.courseIds.push(courseId);

  // 변경된 계획을 서버에서 검증
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextPlan),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "과목 이동에 실패했습니다."
    );
  }

  // 요청 도중 수강 계획이 바뀌었다면 이전 결과 무시
  if (
    currentPlan !== originalPlan ||
    currentCurriculum?.curriculumId !== nextPlan.curriculumId
  ) {
    throw new Error("수강 계획이 변경되었습니다. 다시 시도해 주세요.");
  }

  // 변경된 수강 계획 적용
  currentPlan = nextPlan;

  // 화면 갱신
  renderPlan();
  renderCreditSummary(result.summary);

  renderValidationResult(result);

  showFeedback(
    `${fromTermId}에서 ${toTermId}로 과목을 이동했습니다.`
  );
}

const OTHER_CREDIT_FIELDS = {
  general_required: "general-required",
  general_elective: "general-elective",
  foundation_required: "foundation-required",
  foundation_elective: "foundation-elective",
  free_elective: "free-elective",
};

const applyCreditsButton = document.getElementById(
  "apply-other-credits"
);

const otherCreditsFeedback = document.getElementById(
  "other-credits-feedback"
);

// 전공 외 학점 입력창 초기화
function resetOtherCreditInputs() {
  for (const id of Object.values(OTHER_CREDIT_FIELDS)) {
    document.getElementById(id).value = "0";
  }

  otherCreditsFeedback.textContent = "";
}

// 학점 반영 버튼 클릭
applyCreditsButton.addEventListener("click", async () => {
  if (!currentPlan || !currentCurriculum) {
    otherCreditsFeedback.textContent =
      "교육과정을 먼저 선택해 주세요.";
    return;
  }

  // 기존 계획을 변경하지 않고 복사
  const originalPlan = currentPlan;
  const nextPlan = structuredClone(originalPlan);

  // 입력한 학점 읽기
  for (const [category, inputId] of Object.entries(
    OTHER_CREDIT_FIELDS
  )) {
    const input = document.getElementById(inputId);
    const rawValue = input.value.trim();
    const credits = Number(rawValue);

    if (
      rawValue === "" ||
      !Number.isFinite(credits) ||
      credits < 0
    ) {
      otherCreditsFeedback.textContent =
        "학점은 0 이상의 숫자로 입력해 주세요.";
      return;
    }

    nextPlan.otherEarnedCredits[category] = credits;
  }

  applyCreditsButton.disabled = true;
  otherCreditsFeedback.textContent = "학점 계산 중...";

  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nextPlan),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message ?? "학점 계산에 실패했습니다."
      );
    }

    // 요청 도중 다른 수강 계획으로 변경됐는지 확인
    if (
      currentPlan !== originalPlan ||
      currentCurriculum?.curriculumId !== nextPlan.curriculumId
    ) {
      throw new Error("수강 계획이 변경되었습니다. 다시 시도해 주세요.");
    }

    // 검증에 성공한 계획 반영
    currentPlan = nextPlan;

    // 학점 현황 갱신
    renderCreditSummary(result.summary);

    // 기존 검증 결과 무효화
    renderValidationResult(result);

    otherCreditsFeedback.textContent =
      "전공 외 취득 학점이 반영되었습니다.";

  } catch (error) {
    otherCreditsFeedback.textContent = error.message;
  } finally {
    applyCreditsButton.disabled = false;
  }
});

const validateButton = document.getElementById("validate-button");
const validationResult = document.getElementById("validation-result");

// 검증 항목을 한국어로 표시
const CHECK_NAMES = {
  totalCredits: "총학점",
  majorCredits: "전공학점",
  majorElectiveCredits: "전공선택학점",
  requiredCourses: "필수 이수 과목",
  prerequisites: "선수과목 순서",
  termCreditLimit: "학기별 최대 학점",
  inputReview: "사용자 확인 필요 항목",
};

// 검증 상태를 한국어로 표시
const STATUS_NAMES = {
  met: "충족",
  unmet: "미충족",
  unknown: "확인 필요",
};

// 검증 결과를 화면에 표시
function renderValidationResult(result) {
  validationResult.replaceChildren();

  // 전체 검증 결과
  const heading = document.createElement("h3");
  heading.textContent = "전체 검증 결과 ";

  const overallBadge = document.createElement("span");
  overallBadge.className =
    `maker-status maker-status--${result.overallStatus}`;

  overallBadge.textContent =
    STATUS_NAMES[result.overallStatus] ?? "확인 필요";

  heading.append(overallBadge);
  validationResult.append(heading);

  // 항목별 검증 결과
  const list = document.createElement("ul");
  list.className = "maker-check-list";

  for (const [key, check] of Object.entries(result.checks)) {
    const item = document.createElement("li");

    const name = document.createElement("strong");
    name.textContent = CHECK_NAMES[key] ?? key;

    const badge = document.createElement("span");
    badge.className =
      `maker-status maker-status--${check.status}`;

    badge.textContent =
      STATUS_NAMES[check.status] ?? "확인 필요";

    item.append(name, badge);

    // 부족한 학점 표시
    if (typeof check.missing === "number" && check.missing > 0) {
      const detail = document.createElement("p");
      detail.textContent = `부족 학점: ${check.missing}학점`;
      item.append(detail);
    }

    // 누락된 필수 과목 표시
    if (
      Array.isArray(check.missingCourseIds) &&
      check.missingCourseIds.length > 0
    ) {
      const detail = document.createElement("p");
      detail.textContent =
        `누락된 과목 ID: ${check.missingCourseIds.join(", ")}`;
      item.append(detail);
    }

    // 선수과목 및 학기 학점 위반 표시
    if (Array.isArray(check.issues)) {
      for (const issue of check.issues) {
        const detail = document.createElement("p");

        const target =
          issue.courseId ?? issue.termId ?? "";

        detail.textContent =
          `${target ? target + ": " : ""}${issue.message}`;

        item.append(detail);
      }
    }

    // 사용자 확인 필요 항목 표시
    if (
      key === "inputReview" &&
      check.reviewPendingCount > 0
    ) {
      const detail = document.createElement("p");
      detail.textContent =
        `${check.reviewPendingCount}개 항목의 확인이 필요합니다.`;
      item.append(detail);
    }

    list.append(item);
  }

  validationResult.append(list);

  // 경고 메시지 표시
  if (result.warnings.length > 0) {
    const warningTitle = document.createElement("h4");
    warningTitle.textContent = "확인 및 주의 사항";
    validationResult.append(warningTitle);

    const warningList = document.createElement("ul");

    for (const warning of result.warnings) {
      const item = document.createElement("li");
      item.textContent = warning;
      warningList.append(item);
    }

    validationResult.append(warningList);
  }
}

// 이수요건 검사 버튼 클릭
validateButton.addEventListener("click", async () => {
  if (!currentPlan || !currentCurriculum) {
    validationResult.textContent =
      "교육과정을 먼저 선택해 주세요.";
    return;
  }

  // 검사 요청 시점의 수강 계획 기억
  const submittedPlan = currentPlan;
  const submittedCurriculum = currentCurriculum;

  validateButton.disabled = true;
  validationResult.textContent = "이수요건 검사 중...";

  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submittedPlan),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error?.message ??
        "이수요건 검증에 실패했습니다."
      );
    }

    // 검증 도중 수강 계획이 바뀌었다면 이전 결과 무시
    if (
      currentPlan !== submittedPlan ||
      currentCurriculum !== submittedCurriculum
    ) {
      return;
    }

    // 검증 결과와 학점 현황 표시
    renderValidationResult(result);
    renderCreditSummary(result.summary);

  } catch (error) {
    if (
      currentPlan === submittedPlan &&
      currentCurriculum === submittedCurriculum
    ) {
      validationResult.textContent =
        `검증 오류: ${error.message}`;
    }
  } finally {
    validateButton.disabled = false;
  }
});

async function removeRecordedCourse(status, courseId) {
  if (!currentPlan || !currentCurriculum) {
    throw new Error("교육과정을 먼저 선택해 주세요.");
  }

  // 삭제할 과목이 어느 목록에 있는지 구분
  let listName;

  if (status === "completed") {
    listName = "completedCourses";
  } else if (status === "in_progress") {
    listName = "inProgressCourses";
  } else {
    throw new Error("올바르지 않은 수강 상태입니다.");
  }

  const originalPlan = currentPlan;
  const nextPlan = structuredClone(originalPlan);

  // 삭제할 과목이 실제로 있는지 확인
  const exists = nextPlan[listName].some(
    item => item.courseId === courseId
  );

  if (!exists) {
    throw new Error("삭제할 과목을 찾을 수 없습니다.");
  }

  const courseName = findCourse(courseId)?.name ?? courseId;

  // 해당 과목 삭제
  nextPlan[listName] = nextPlan[listName].filter(
    item => item.courseId !== courseId
  );

  // 삭제 후 서버에서 다시 검증
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextPlan),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message ?? "과목 삭제에 실패했습니다."
    );
  }

  // 검증 요청 중 수강 계획이 변경되었는지 확인
  if (
    currentPlan !== originalPlan ||
    currentCurriculum?.curriculumId !== nextPlan.curriculumId
  ) {
    throw new Error("수강 계획이 변경되었습니다. 다시 시도해 주세요.");
  }

  // 검증 성공 후 현재 계획에 반영
  currentPlan = nextPlan;

  // 과목 목록, 학점, 이수요건 결과 갱신
  renderPlan();
  renderCreditSummary(result.summary);
  renderValidationResult(result);

  showFeedback(`${courseName} 과목이 삭제되었습니다.`);
}
