import { CURRICULUM_ID_PATTERN } from "../../shared/curriculum/schema.js";
import { validatePlan } from "../../shared/maker/validation.js";
import { sendError } from "../errors.js";

const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;

const OTHER_CATEGORIES = [
  "general_required",
  "general_elective",
  "foundation_required",
  "foundation_elective",
  "free_elective",
];

function isObject(value) {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function isNonnegativeNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0;
}

function isCourseId(value) {
  return typeof value === "string" &&
    value.trim().length > 0;
}

// 요청 데이터의 기본 형식 검사
function checkRequestFormat(plan) {
  const errors = [];

  function addError(field, reason) {
    errors.push({ field, reason });
  }

  if (!isObject(plan)) {
    addError("body", "JSON 객체가 필요합니다.");
    return errors;
  }

  if (plan.schemaVersion !== 1) {
    addError("schemaVersion", "계약 버전은 1이어야 합니다.");
  }

  if (
    typeof plan.curriculumId !== "string" ||
    !CURRICULUM_ID_PATTERN.test(plan.curriculumId)
  ) {
    addError("curriculumId", "교육과정 ID 형식이 올바르지 않습니다.");
  }

  if (
    !Number.isInteger(plan.reviewPendingCount) ||
    plan.reviewPendingCount < 0
  ) {
    addError("reviewPendingCount", "0 이상의 정수여야 합니다.");
  }

  // 이수 완료와 수강 중 과목의 형식 검사
  for (const field of ["completedCourses", "inProgressCourses"]) {
    if (!Array.isArray(plan[field])) {
      addError(field, "배열이어야 합니다.");
      continue;
    }

    plan[field].forEach((item, index) => {
      const path = `${field}[${index}]`;

      if (!isObject(item)) {
        addError(path, "과목 정보가 올바르지 않습니다.");
        return;
      }

      if (!isCourseId(item.courseId)) {
        addError(`${path}.courseId`, "과목 ID가 필요합니다.");
      }

      if (!TERM_PATTERN.test(item.termId)) {
        addError(`${path}.termId`, "학기 형식이 올바르지 않습니다.");
      }

      if (
        field === "completedCourses" &&
        !isNonnegativeNumber(item.earnedCredits)
      ) {
        addError(`${path}.earnedCredits`, "인정 학점이 올바르지 않습니다.");
      }
    });
  }

  // 전공 외 취득 학점 검사
  if (!isObject(plan.otherEarnedCredits)) {
    addError("otherEarnedCredits", "학점 객체가 필요합니다.");
  } else {
    for (const category of OTHER_CATEGORIES) {
      if (!isNonnegativeNumber(plan.otherEarnedCredits[category])) {
        addError(`otherEarnedCredits.${category}`, "학점이 올바르지 않습니다.");
      }
    }
  }

  // 학기별 수강 계획 형식 검사
  if (!Array.isArray(plan.plannedTerms)) {
    addError("plannedTerms", "배열이어야 합니다.");
  } else {
    plan.plannedTerms.forEach((term, index) => {
      const path = `plannedTerms[${index}]`;

      if (!isObject(term)) {
        addError(path, "학기 정보가 올바르지 않습니다.");
        return;
      }

      if (!TERM_PATTERN.test(term.termId)) {
        addError(`${path}.termId`, "학기 형식이 올바르지 않습니다.");
      }

      if (!Array.isArray(term.courseIds)) {
        addError(`${path}.courseIds`, "과목 ID 배열이 필요합니다.");
        return;
      }

      term.courseIds.forEach((courseId, courseIndex) => {
        if (!isCourseId(courseId)) {
          addError(
            `${path}.courseIds[${courseIndex}]`,
            "과목 ID가 올바르지 않습니다."
          );
        }
      });
    });
  }

  return errors;
}

// 교육과정에 없는 과목과 중복 배치 검사
function checkPlanRules(plan, curriculum) {
  const errors = [];
  const validIds = new Set(curriculum.courses.map(course => course.id));
  const usedIds = new Set();
  const usedTerms = new Set();

  function checkCourse(courseId, field) {
    if (!validIds.has(courseId)) {
      errors.push({
        field,
        reason: "존재하지 않는 과목 ID",
      });
      return;
    }

    if (usedIds.has(courseId)) {
      errors.push({
        field,
        reason: "이미 등록된 과목 ID",
      });
      return;
    }

    usedIds.add(courseId);
  }

  plan.completedCourses.forEach((item, index) => {
    checkCourse(item.courseId, `completedCourses[${index}].courseId`);
  });

  plan.inProgressCourses.forEach((item, index) => {
    checkCourse(item.courseId, `inProgressCourses[${index}].courseId`);
  });

  plan.plannedTerms.forEach((term, index) => {
    if (usedTerms.has(term.termId)) {
      errors.push({
        field: `plannedTerms[${index}].termId`,
        reason: "동일 학기가 중복 등록되었습니다.",
      });
    }

    usedTerms.add(term.termId);

    term.courseIds.forEach((courseId, courseIndex) => {
      checkCourse(
        courseId,
        `plannedTerms[${index}].courseIds[${courseIndex}]`
      );
    });
  });

  return errors;
}

// 검증 API를 기존 Express 앱에 등록
export function registerValidateRoute(app, store) {
  app.post("/api/validate", (request, response) => {
    const plan = request.body;

    // HTTP 400: 요청 형식 오류
    const formatErrors = checkRequestFormat(plan);

    if (formatErrors.length > 0) {
      return sendError(
        response,
        400,
        "INVALID_REQUEST",
        "요청 데이터 형식이 올바르지 않습니다.",
        formatErrors
      );
    }

    // HTTP 500: 서버 교육과정 데이터 오류
    if (store.errors.length > 0) {
      return sendError(
        response,
        500,
        "INTERNAL_ERROR",
        "교육과정 데이터를 불러오지 못했습니다."
      );
    }

    // curriculumId가 속한 학과 검색
    const department = store.departments.find(dept =>
      dept.curricula.some(item => item.id === plan.curriculumId)
    );

    // HTTP 404: 교육과정이 존재하지 않음
    if (!department) {
      return sendError(
        response,
        404,
        "CURRICULUM_NOT_FOUND",
        "등록되지 않은 교육과정입니다."
      );
    }

    const { curriculum } = store.findCurriculum(
      department.id,
      plan.curriculumId
    );

    if (!curriculum) {
      return sendError(
        response,
        404,
        "CURRICULUM_NOT_FOUND",
        "교육과정을 찾을 수 없습니다."
      );
    }

    // HTTP 422: 유효하지 않은 과목이나 중복 배치
    const planErrors = checkPlanRules(plan, curriculum);

    if (planErrors.length > 0) {
      return sendError(
        response,
        422,
        "INVALID_PLAN",
        "수강 계획에 유효하지 않은 항목이 있습니다.",
        planErrors
      );
    }

    // HTTP 200: 검증 결과 반환
    response.json(validatePlan(plan, curriculum));
  });
}
