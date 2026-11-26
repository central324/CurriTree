import {
  consumeMakerHandoff,
  sanitizeMakerPlan,
  saveMakerHandoff,
} from './handoff.js';

import {
  getAdmissionYearSupport,
} from '../../shared/curriculum/admission-year.js';

const ADMISSION_CONTEXT_KEY = 'curritree:maker-admission:v1';

/**
 * 수강 계획과 입학년도를 함께 전달합니다.
 * 기존 수강 계획 데이터 구조는 변경하지 않습니다.
 */
export function saveMakerTransfer(
  storage,
  { plan, curriculum, admissionYear }
) {
  const safePlan = sanitizeMakerPlan(plan);

  if (
    !curriculum ||
    curriculum.curriculumId !== safePlan.curriculumId
  ) {
    throw new TypeError(
      '전달할 수강 계획과 교육과정이 일치하지 않습니다.'
    );
  }

  const support = getAdmissionYearSupport({
    admissionYear,
    admissionYears: curriculum.admissionYears,
  });

  if (support.status !== 'supported') {
    throw new TypeError(
      '지원되지 않는 입학년도는 전달할 수 없습니다.'
    );
  }

  const context = {
    curriculumId: safePlan.curriculumId,
    admissionYear: support.admissionYear,
  };

  let previousAdmissionValue;
  try {
    // 이전에 전달 대기 중이던 입학년도 정보를 보관합니다.
    previousAdmissionValue = storage.getItem(
      ADMISSION_CONTEXT_KEY
    );

    storage.setItem(
      ADMISSION_CONTEXT_KEY,
      JSON.stringify(context)
    );

    saveMakerHandoff(storage, safePlan);
  } catch (error) {
    // 새 계획 저장에 실패하면 이전 입학년도 정보를 복원합니다.
    if (previousAdmissionValue !== undefined) {
      try {
        if (previousAdmissionValue === null) {
          storage.removeItem(ADMISSION_CONTEXT_KEY);
        } else {
          storage.setItem(
            ADMISSION_CONTEXT_KEY,
            previousAdmissionValue
          );
        }
      } catch {
        // 복구에도 실패했다면 원래 저장 오류를 유지합니다.
      }
    }

    throw error;
  }
}

/**
 * 수강 계획 및 입학년도 정보를 한 번 읽고 제거합니다.
 *
 * 입학년도 정보가 손상되었더라도
 * 정상적인 수강 계획은 유지합니다.
 */
export function consumeMakerTransfer(storage) {
  const plan = consumeMakerHandoff(storage);
  let admissionContext = null;

  try {
    const raw = storage.getItem(ADMISSION_CONTEXT_KEY);

    if (raw !== null) {
      // 읽은 후 즉시 삭제하여 이전 값이 재사용되지 않도록 합니다.
      storage.removeItem(ADMISSION_CONTEXT_KEY);

      const candidate = JSON.parse(raw);

      if (
        candidate &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate) &&
        typeof candidate.curriculumId === 'string' &&
        Number.isSafeInteger(candidate.admissionYear) &&
        candidate.admissionYear >= 1000 &&
        candidate.admissionYear <= 9999 &&
        plan?.curriculumId === candidate.curriculumId
      ) {
        admissionContext = {
          curriculumId: candidate.curriculumId,
          admissionYear: candidate.admissionYear,
        };
      }
    }
  } catch {
    // 손상된 입학년도 정보는 무시하고 수동 확인을 사용합니다.
  }

  return {
    plan,
    admissionContext,
  };
}

/**
 * 전달된 입학년도가 실제 교육과정에도 적용되는지 확인합니다.
 * 검증할 수 없으면 null을 반환합니다.
 */
export function resolveTransferAdmissionYear(
  plan,
  admissionContext,
  curriculum
) {
  if (
    !plan ||
    !admissionContext ||
    !curriculum ||
    plan.curriculumId !== admissionContext.curriculumId ||
    curriculum.curriculumId !== admissionContext.curriculumId
  ) {
    return null;
  }

  try {
    const support = getAdmissionYearSupport({
      admissionYear: admissionContext.admissionYear,
      admissionYears: curriculum.admissionYears,
    });

    return support.status === 'supported'
      ? support.admissionYear
      : null;
  } catch {
    return null;
  }
}
