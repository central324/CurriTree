const YEAR_PATTERN = /^\d{4}$/;

function isValidYear(year) {
  return (
    Number.isSafeInteger(year) &&
    year >= 1000 &&
    year <= 9999
  );
}

/**
 * 사용자가 입력한 입학년도를 정수로 변환합니다.
 * 올바른 4자리 연도가 아니면 null을 반환합니다.
 */
function normalizeAdmissionYear(value) {
  if (typeof value === 'number') {
    return isValidYear(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (!YEAR_PATTERN.test(trimmed)) {
    return null;
  }

  const year = Number(trimmed);

  return isValidYear(year) ? year : null;
}

/**
 * 사용자의 입학년도가 해당 교육과정의 지원 범위에
 * 포함되는지 판단합니다.
 *
 * status:
 * - supported: 지원되는 입학년도
 * - unsupported: 지원되지 않는 입학년도
 * - unselected: 입학년도 미선택
 * - invalid: 잘못된 입학년도 입력
 *
 * @param {object} options
 * @param {string|number|null} options.admissionYear
 * @param {number[]} options.admissionYears
 */
export function getAdmissionYearSupport({
  admissionYear,
  admissionYears,
}) {
  // 교육과정의 적용 입학년도 데이터가 잘못된 경우
  // 임의로 지원 여부를 판단하지 않습니다.
  if (
    !Array.isArray(admissionYears) ||
    admissionYears.length === 0 ||
    !admissionYears.every(isValidYear)
  ) {
    throw new TypeError(
      '교육과정의 적용 입학년도 정보가 올바르지 않습니다.'
    );
  }

  const supportedYears = [...new Set(admissionYears)];

  // 사용자가 아직 입학년도를 선택하지 않은 상태
  const isUnselected =
    admissionYear === null ||
    admissionYear === undefined ||
    (
      typeof admissionYear === 'string' &&
      admissionYear.trim() === ''
    );

  if (isUnselected) {
    return {
      status: 'unselected',
      admissionYear: null,
      supportedYears,
    };
  }

  const normalizedYear = normalizeAdmissionYear(admissionYear);

  if (normalizedYear === null) {
    return {
      status: 'invalid',
      admissionYear: null,
      supportedYears,
    };
  }

  return {
    status: supportedYears.includes(normalizedYear)
      ? 'supported'
      : 'unsupported',
    admissionYear: normalizedYear,
    supportedYears,
  };
}
