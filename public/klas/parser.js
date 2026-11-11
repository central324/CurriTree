
const CATEGORY_MAP = {
  전필: 'major_required',
  전선: 'major_elective',
  교필: 'general_required',
  교선: 'general_elective',
  기필: 'foundation_required',
  기선: 'foundation_elective',
  일선: 'free_elective',
};

const TERM_PATTERN =
  /^(\d{4})학년도\s*(?:(1|2)학기|계절학기\s*\((하계|동계)\))$/;

const COURSE_CODE_PATTERN =
  /^((?:[A-Za-z]\d{3}|\d{4})-\d-\d{4})-\d{2}$/;

const VALID_TERM_ID_PATTERN = /^\d{4}-(?:1|2|S|W)$/;

export function parseTermId(heading) {
  const match = String(heading).trim().match(TERM_PATTERN);

  if (!match) {
    return null;
  }

  const year = match[1];
  const regularTerm = match[2];
  const seasonalTerm = match[3];

  if (regularTerm) {
    return `${year}-${regularTerm}`;
  }

  return `${year}-${seasonalTerm === '하계' ? 'S' : 'W'}`;
}

export function extractSubjectCode(courseCode) {
  if (typeof courseCode !== 'string') {
    return null;
  }

  const match = courseCode.trim().match(COURSE_CODE_PATTERN);

  return match ? match[1].toUpperCase() : null;
}

export function classifyCompletionStatus({
  grade,
  isDeleted = false,
  termId,
  currentTermId = null,
}) {
  const normalizedGrade = String(grade ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();

  if (isDeleted || normalizedGrade.includes('삭제')) {
    return 'deleted';
  }

  if (normalizedGrade === 'F' || normalizedGrade === 'NP') {
    return 'failed';
  }

  if (/^(?:[ABCD](?:\+|0)|P)$/.test(normalizedGrade)) {
    return 'completed';
  }

  if (normalizedGrade === '') {
    if (currentTermId && termId === currentTermId) {
      return 'in_progress';
    }

    return 'needs_review';
  }

  return 'needs_review';
}

export function parseKlasText(rawText, { currentTermId = null } = {}) {
  if (typeof rawText !== 'string') {
    throw new TypeError('KLAS 입력값은 문자열이어야 합니다.');
  }

  if (
    currentTermId !== null &&
    !VALID_TERM_ID_PATTERN.test(currentTermId)
  ) {
    throw new TypeError('현재 학기 형식이 올바르지 않습니다.');
  }

  const lines = rawText.replace(/\r\n?/g, '\n').split('\n');

  const courses = [];
  const warnings = [];

  let activeTermId = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (!line.trim()) {
      continue;
    }

    const parsedTermId = parseTermId(line);

    if (parsedTermId) {
      activeTermId = parsedTermId;
      continue;
    }

    if (
      /^학정번호(?:\t|$)/.test(line) ||
      line === '재수강이후' ||
      line === '삭제여부'
    ) {
      continue;
    }

    const columns = line.split('\t').map((value) => value.trim());

    if (columns.length < 6 || !columns[1]) {
      warnings.push({
        lineNumber,
        reason: 'ROW_FORMAT_INVALID',
      });
      continue;
    }

    if (!activeTermId) {
      warnings.push({
        lineNumber,
        reason: 'TERM_NOT_FOUND',
      });
      continue;
    }

    const courseCode = columns[0] || null;
    const name = columns[1];
    const category = CATEGORY_MAP[columns[3]] ?? 'unknown';

    const creditsText = columns[4];

    const credits =
      /^\d+(?:\.\d+)?$/.test(creditsText)
        ? Number(creditsText)
        : null;

    const grade = columns[5];
    const deletionFlag = columns[8] ?? '';

    const isDeleted = deletionFlag.includes('삭제');

    let completionStatus = classifyCompletionStatus({
      grade,
      isDeleted,
      termId: activeTermId,
      currentTermId,
    });

    if (credits === null || category === 'unknown') {
      completionStatus = 'needs_review';

      warnings.push({
        lineNumber,
        reason: 'COURSE_INFORMATION_INCOMPLETE',
      });
    }

    courses.push({
      clientRowId: `local-${String(courses.length + 1).padStart(3, '0')}`,
      termId: activeTermId,
      courseCode,
      subjectCode: extractSubjectCode(courseCode),
      name,
      credits,
      category,
      completionStatus,
      match: {
        status: 'unmatched',
        courseId: null,
      },
    });
  }

  return {
    courses,
    warnings,
  };
}