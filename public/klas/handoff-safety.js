/**
 * KLAS 분석 결과의 전달 안전성을 판단합니다.
 *
 * 파싱 경고와 수강 기록 확인 필요 건수는 서로 다른
 * 의미이므로 합산하거나 원본 값을 변경하지 않습니다.
 *
 * @param {object} options
 * @param {Array} options.warnings - KLAS 파싱 경고 목록
 * @param {number} options.reviewPendingCount - 수강 기록 확인 필요 건수
 * @returns {object} 전달 안전성 상태
 */
export function getHandoffSafetyState({
  warnings,
  reviewPendingCount,
}) {
  if (!Array.isArray(warnings)) {
    throw new TypeError(
      'KLAS 파싱 경고 목록이 올바르지 않습니다.'
    );
  }

  if (
    !Number.isSafeInteger(reviewPendingCount) ||
    reviewPendingCount < 0
  ) {
    throw new TypeError(
      '수강 기록 확인 필요 건수가 올바르지 않습니다.'
    );
  }

  const parsingWarningCount = warnings.length;

  const hasParsingWarnings = parsingWarningCount > 0;
  const hasReviewPending = reviewPendingCount > 0;

  return {
    parsingWarningCount,
    reviewPendingCount,
    hasParsingWarnings,
    hasReviewPending,

    // 경고 또는 확인 필요 항목이 있으면 사용자 동의가 필요합니다.
    requiresConfirmation:
      hasParsingWarnings || hasReviewPending,

    // 두 종류의 경고가 모두 없어야 정상 완료로 표시합니다.
    isFullyReviewed:
      !hasParsingWarnings && !hasReviewPending,
  };
}
