const TERM_PATTERN = /^\d{4}-(1|2|S|W)$/;

const WARNING_GUIDANCE = {
  ROW_FORMAT_INVALID:
    '과목 행의 형식이 올바르지 않습니다. ' +
    '학정번호, 과목명, 개설학과, 이수구분, 학점, 성적이 ' +
    '올바르게 복사되었는지 확인해주세요.',

  TERM_NOT_FOUND:
    '과목의 소속 학기를 확인할 수 없습니다. ' +
    '해당 과목 위에 학년도와 학기 제목이 있는지 확인해주세요.',

  TERM_FORMAT_INVALID:
    '학기 제목 형식이 올바르지 않습니다. ' +
    '"2026학년도 1학기" 또는 ' +
    '"2026학년도 계절학기(하계)" 형식인지 확인해주세요.',

  COURSE_INFORMATION_INCOMPLETE:
    '학점 또는 이수구분이 불완전합니다. ' +
    '원본 정보를 확인해주세요. ' +
    '인식된 과목은 확인 필요 상태로 유지됩니다.',
};

export function isValidCurrentTerm(value) {
  return TERM_PATTERN.test(String(value ?? '').trim());
}

export function getKlasInputHint(rawText, currentTermId) {
  if (!String(rawText ?? '').trim()) {
    return 'KLAS 성적조회 텍스트를 입력해주세요. ' +
      '입력 방법이 어렵다면 위의 복사 가이드를 확인해주세요.';
  }

  if (!isValidCurrentTerm(currentTermId)) {
    return '현재 학기는 2026-1, 2026-2, ' +
      '2026-S, 2026-W와 같은 형식으로 입력해주세요.';
  }

  return '';
}

export function getKlasWarningGuidance(reason) {
  return WARNING_GUIDANCE[reason] ??
    '해당 줄의 내용을 확인해주세요.';
}

export function getKlasLineSelection(rawText, lineNumber) {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return null;
  }

  const normalizedText = String(rawText ?? '')
    .replace(/\r\n?/g, '\n');

  const lines = normalizedText.split('\n');

  if (lineNumber > lines.length) {
    return null;
  }

  const start = lines
    .slice(0, lineNumber - 1)
    .reduce((total, line) => total + line.length + 1, 0);

  return {
    start,
    end: start + lines[lineNumber - 1].length,
  };
}
