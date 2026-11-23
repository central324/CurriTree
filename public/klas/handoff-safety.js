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

/**
 * 전달 전 확인이 필요한 경우 안내 메시지를 생성합니다.
 * 경고가 없는 경우에는 null을 반환합니다.
 */
export function getHandoffConfirmationMessage(safety) {
  if (!safety.requiresConfirmation) {
    return null;
  }

  const lines = [
    '커리메이커 전달 데이터를 확인해주세요.',
    '',
  ];

  if (safety.hasParsingWarnings) {
    lines.push(
      `파싱 경고 ${safety.parsingWarningCount}건: ` +
      '일부 입력 행이 분석에서 제외되었거나 ' +
      '추가 확인이 필요할 수 있습니다.'
    );
  }

  if (safety.hasReviewPending) {
    lines.push(
      `수강 기록 확인 필요 ${safety.reviewPendingCount}건: ` +
      '미확정 수강 기록은 취득 학점에 포함되지 않습니다.'
    );
  }

  lines.push(
    '',
    '현재 정상 인식되고 확정된 정보만 사용하여 계속 진행하시겠습니까?'
  );

  return lines.join('\n');
}

/**
 * 경고가 있는 경우 사용자 확인을 요청합니다.
 *
 * confirmFn을 외부에서 전달받아 브라우저에 의존하지 않고
 * 승인·취소 동작을 단위 테스트할 수 있도록 합니다.
 */
export function confirmHandoffWithUser(safety, confirmFn) {
  const message = getHandoffConfirmationMessage(safety);

  // 경고가 없다면 추가 확인이 필요하지 않습니다.
  if (message === null) {
    return true;
  }

  if (typeof confirmFn !== 'function') {
    throw new TypeError('사용자 확인 함수가 필요합니다.');
  }

  // 명시적으로 확인한 경우에만 진행합니다.
  return confirmFn(message) === true;
}
