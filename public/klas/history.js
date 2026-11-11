
const TERM_ORDER = {
  '1': 0,
  S: 1,
  '2': 2,
  W: 3,
};

const EXCLUDED_STATUSES = new Set([
  'failed',
  'deleted',
]);

const ACTIVE_STATUSES = new Set([
  'completed',
  'in_progress',
]);

function getTermOrder(termId) {
  const match = String(termId ?? '').match(
    /^(\d{4})-(1|S|2|W)$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const term = match[2];

  return year * 4 + TERM_ORDER[term];
}

function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');
}

function getCourseIdentity(row) {
  const matchStatus = row.match?.status;
  const courseId = row.match?.courseId;

  if (
    (matchStatus === 'exact' || matchStatus === 'confirmed') &&
    typeof courseId === 'string' &&
    courseId.trim()
  ) {
    return `course:${courseId}`;
  }

  if (
    typeof row.subjectCode === 'string' &&
    row.subjectCode.trim()
  ) {
    return `code:${row.subjectCode.trim().toUpperCase()}`;
  }

  return null;
}

export function analyzeCourseHistory(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError('수강 이력은 배열이어야 합니다.');
  }

  const groups = new Map();
  const excludedRowIds = [];

  const completedCandidates = [];
  const inProgressCandidates = [];

  const reviewPending = new Set();
  const reviewIssues = [];

  function addReviewIssue(reason, issueRows) {
    const clientRowIds = [
      ...new Set(issueRows.map((row) => row.clientRowId)),
    ];

    for (const clientRowId of clientRowIds) {
      reviewPending.add(clientRowId);
    }

    reviewIssues.push({
      reason,
      clientRowIds,
    });
  }

  for (const row of rows) {
    if (
      !row ||
      typeof row.clientRowId !== 'string' ||
      !row.clientRowId
    ) {
      throw new TypeError('수강 이력의 행 ID가 올바르지 않습니다.');
    }

    if (EXCLUDED_STATUSES.has(row.completionStatus)) {
      excludedRowIds.push(row.clientRowId);
    }

    const identity = getCourseIdentity(row);

    if (!identity) {
      if (!EXCLUDED_STATUSES.has(row.completionStatus)) {
        addReviewIssue('IDENTITY_UNCERTAIN', [row]);
      }

      continue;
    }

    if (!groups.has(identity)) {
      groups.set(identity, []);
    }

    groups.get(identity).push(row);
  }

  for (const groupRows of groups.values()) {
    const activeRows = groupRows.filter((row) =>
      ACTIVE_STATUSES.has(row.completionStatus)
    );

    const uncertainRows = groupRows.filter(
      (row) =>
        !ACTIVE_STATUSES.has(row.completionStatus) &&
        !EXCLUDED_STATUSES.has(row.completionStatus)
    );

    if (uncertainRows.length > 0) {
      addReviewIssue(
        'STATUS_UNCERTAIN',
        [...activeRows, ...uncertainRows]
      );

      continue;
    }

    if (activeRows.length > 1) {
      addReviewIssue(
        'MULTIPLE_ACTIVE_RECORDS',
        activeRows
      );

      continue;
    }

    if (activeRows.length === 0) {
      continue;
    }

    const candidate = activeRows[0];
    const candidateTerm = getTermOrder(candidate.termId);

    if (candidateTerm === null) {
      addReviewIssue('TERM_INVALID', [candidate]);
      continue;
    }

    if (candidate.completionStatus === 'completed') {
      const excludedAttempts = groupRows.filter((row) =>
        EXCLUDED_STATUSES.has(row.completionStatus)
      );

      const uncertainAttempts = excludedAttempts.filter((row) => {
        const attemptTerm = getTermOrder(row.termId);

        return (
          attemptTerm === null ||
          attemptTerm >= candidateTerm
        );
      });

      if (uncertainAttempts.length > 0) {
        addReviewIssue(
          'LATER_ATTEMPT_UNCERTAIN',
          [candidate, ...uncertainAttempts]
        );

        continue;
      }

      completedCandidates.push(candidate.clientRowId);
    } else if (candidate.completionStatus === 'in_progress') {
      inProgressCandidates.push(candidate.clientRowId);
    }
  }

  const recordsByName = new Map();

  for (const row of rows) {
    if (!ACTIVE_STATUSES.has(row.completionStatus)) {
      continue;
    }

    const normalizedName = normalizeName(row.name);

    if (!normalizedName) {
      continue;
    }

    if (!recordsByName.has(normalizedName)) {
      recordsByName.set(normalizedName, []);
    }

    recordsByName.get(normalizedName).push(row);
  }

  for (const sameNameRows of recordsByName.values()) {
    if (sameNameRows.length < 2) {
      continue;
    }

    const identities = new Set(
      sameNameRows.map(
        (row) =>
          getCourseIdentity(row) ??
          `unknown:${row.clientRowId}`
      )
    );

    if (identities.size > 1) {
      addReviewIssue(
        'POSSIBLE_SAME_COURSE',
        sameNameRows
      );
    }
  }

  return {
    completedCandidates: completedCandidates.filter(
      (rowId) => !reviewPending.has(rowId)
    ),

    inProgressCandidates: inProgressCandidates.filter(
      (rowId) => !reviewPending.has(rowId)
    ),

    excludedRowIds,

    reviewPendingRowIds: [...reviewPending],

    reviewIssues,
  };
}