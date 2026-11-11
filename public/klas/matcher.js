
export function normalizeCourseName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .toLocaleLowerCase('ko-KR');
}

// Normalize course codes.
export function normalizeCourseCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function findByCourseCode(subjectCode, courses) {
  const normalizedCode = normalizeCourseCode(subjectCode);

  if (!normalizedCode) {
    return [];
  }

  return courses.filter((course) => {
    const courseCodes = course.courseCodes ?? [];

    return courseCodes.some(
      (code) => normalizeCourseCode(code) === normalizedCode
    );
  });
}

// Find curriculum courses with the same name or alias.
function findByCourseName(name, courses) {
  const normalizedName = normalizeCourseName(name);

  if (!normalizedName) {
    return [];
  }

  return courses.filter((course) => {
    const names = [
      course.name,
      ...(course.aliases ?? []),
    ];

    return names.some(
      (candidate) =>
        normalizeCourseName(candidate) === normalizedName
    );
  });
}

export function matchParsedCourses(parsedCourses, curriculum) {
  if (!Array.isArray(parsedCourses)) {
    throw new TypeError('과목 목록은 배열이어야 합니다.');
  }

  if (!curriculum || !Array.isArray(curriculum.courses)) {
    throw new TypeError('교육과정 과목 목록이 올바르지 않습니다.');
  }

  const curriculumCourses = curriculum.courses;
  const reviewIssues = [];

  const courses = parsedCourses.map((row) => {
    if (row.match?.status === 'confirmed') {
      const confirmedCourse = curriculumCourses.find(
        (course) => course.id === row.match.courseId
      );

      if (confirmedCourse) {
        return {
          ...row,
          match: {
            status: 'confirmed',
            courseId: confirmedCourse.id,
          },
        };
      }
    }

    const codeMatches = findByCourseCode(
      row.subjectCode,
      curriculumCourses
    );

    const nameMatches = findByCourseName(
      row.name,
      curriculumCourses
    );

    let matchedCourse = null;
    let reviewReason = null;

    if (codeMatches.length > 1) {
      reviewReason = 'AMBIGUOUS_CODE';
    } else if (codeMatches.length === 1) {
      const codeMatchedCourse = codeMatches[0];

      const hasNameConflict =
        nameMatches.length > 0 &&
        !nameMatches.some(
          (course) => course.id === codeMatchedCourse.id
        );

      if (hasNameConflict) {
        reviewReason = 'CODE_NAME_CONFLICT';
      } else {
        matchedCourse = codeMatchedCourse;
      }
    } else if (nameMatches.length === 1) {
      matchedCourse = nameMatches[0];
    } else if (nameMatches.length > 1) {
      reviewReason = 'AMBIGUOUS_NAME';
    } else {
      reviewReason = 'NO_MATCH';
    }

    if (matchedCourse) {
      return {
        ...row,
        match: {
          status: 'exact',
          courseId: matchedCourse.id,
        },
      };
    }

    const candidateCourseIds = [
      ...new Set([
        ...codeMatches.map((course) => course.id),
        ...nameMatches.map((course) => course.id),
      ]),
    ];

    reviewIssues.push({
      clientRowId: row.clientRowId,
      reason: reviewReason,
      candidateCourseIds,
    });

    return {
      ...row,
      match: {
        status: 'unmatched',
        courseId: null,
      },
    };
  });

  return {
    courses,
    reviewIssues,
  };
}