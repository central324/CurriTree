export function createEmptyPlan(curriculumId) {
  if (typeof curriculumId !== "string" || curriculumId.trim() === "") {
    throw new TypeError("교육과정 ID가 올바르지 않습니다.");
  }

  return {
    schemaVersion: 1,
    curriculumId: curriculumId,
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


export function addCourseToTerm(plan, termId, courseId) {
  // 수강 계획 데이터 확인
  if (
    !plan ||
    !Array.isArray(plan.completedCourses) ||
    !Array.isArray(plan.inProgressCourses) ||
    !Array.isArray(plan.plannedTerms)
  ) {
    throw new TypeError("수강 계획 형식이 올바르지 않습니다.");
  }

  // 학기와 과목 ID 확인
  if (typeof termId !== "string" ||
      !/^\d{4}-(1|2|S|W)$/.test(termId)) {
    throw new TypeError("학기 형식이 올바르지 않습니다.");
  }

  if (typeof courseId !== "string" || !courseId.trim()) {
    throw new TypeError("과목 ID가 올바르지 않습니다.");
  }

  // 이수 완료, 수강 중, 수강 예정 과목의 중복 방지
  const alreadyExists =
    plan.completedCourses.some(c => c.courseId === courseId) ||
    plan.inProgressCourses.some(c => c.courseId === courseId) ||
    plan.plannedTerms.some(term =>
      term.courseIds.includes(courseId)
    );

  if (alreadyExists) {
    throw new Error("이미 수강 계획에 등록된 과목입니다.");
  }

  // 기존에 해당 학기가 있다면 과목 추가
  const termExists = plan.plannedTerms.some(
    term => term.termId === termId
  );

  if (termExists) {
    return {
      ...plan,
      plannedTerms: plan.plannedTerms.map(term =>
        term.termId === termId
          ? { ...term, courseIds: [...term.courseIds, courseId] }
          : term
      ),
    };
  }

  // 해당 학기가 없다면 새 학기 생성
  return {
    ...plan,
    plannedTerms: [
      ...plan.plannedTerms,
      { termId, courseIds: [courseId] },
    ],
  };
}

export function removeCourseFromTerm(plan, termId, courseId) {
  // 수강 계획 데이터 확인
  if (!plan || !Array.isArray(plan.plannedTerms)) {
    throw new TypeError("수강 계획 형식이 올바르지 않습니다.");
  }

  // 학기 형식 확인
  if (
    typeof termId !== "string" ||
    !/^\d{4}-(1|2|S|W)$/.test(termId)
  ) {
    throw new TypeError("학기 형식이 올바르지 않습니다.");
  }

  // 과목 ID 확인
  if (typeof courseId !== "string" || !courseId.trim()) {
    throw new TypeError("과목 ID가 올바르지 않습니다.");
  }

  // 삭제하려는 과목이 해당 학기에 있는지 확인
  const targetTerm = plan.plannedTerms.find(
    term => term.termId === termId
  );

  if (!targetTerm || !targetTerm.courseIds.includes(courseId)) {
    throw new Error("해당 학기에 등록된 과목이 없습니다.");
  }

  // 해당 학기에서 과목 삭제
  const updatedTerms = plan.plannedTerms.map(term => {
    if (term.termId === termId) {
      return {
        ...term,
        courseIds: term.courseIds.filter(id => id !== courseId),
      };
    }

    return term;
  });

  // 과목이 하나도 남지 않은 학기는 제거
  const remainingTerms = updatedTerms.filter(
    term => term.courseIds.length > 0
  );

  // 수정된 수강 계획 반환
  return {
    ...plan,
    plannedTerms: remainingTerms,
  };
}

export function moveCourseToTerm(plan, fromTermId, toTermId, courseId) {
  // 이동 전과 이동 후 학기가 같으면 오류
  if (fromTermId === toTermId) {
    throw new Error("같은 학기로는 이동할 수 없습니다.");
  }

  // 기존 학기에서 과목 삭제
  const removedPlan = removeCourseFromTerm(
    plan,
    fromTermId,
    courseId
  );

  // 새로운 학기에 과목 추가
  const updatedPlan = addCourseToTerm(
    removedPlan,
    toTermId,
    courseId
  );

  return updatedPlan;
}
