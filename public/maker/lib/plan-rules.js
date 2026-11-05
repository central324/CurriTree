/**
 * 수강 계획 계산 규칙 (초기 버전)
 *
 * 커리메이커 화면이 쓰는 순수 함수입니다. DOM이나 Express 객체에 의존하지 않습니다.
 * 지금은 화면 전용 위치(public/maker/lib/)에 두었고, 서버 판정 API(`POST /api/validate`)를
 * 만들 때 shared/로 옮겨 서버와 화면이 같은 파일을 쓰도록 합니다.
 *
 * ⚠️ 데이터 형식은 docs/CONTRACT_CHECKLIST.md에서 확정되기 전의 초안입니다.
 *    판정 규칙 담당(조찬희)이 검토하면서 필드명과 규칙을 고정합니다.
 *
 * 사용하는 데이터 모양
 *
 *   catalog      { [courseId]: { id, name, credits, type: '전필' | '전선', prerequisites: string[] } }
 *   plan         { semesters: { [semesterKey]: string[] } }   // semesterKey 예: '2-1' (2학년 1학기)
 *   requirements { majorCredits, electiveCredits, requiredCourses: string[], maxCreditsPerSemester }
 */

/** 1학년 1학기부터 4학년 2학기까지의 학기 키 */
export const SEMESTER_KEYS = Object.freeze(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']);

/** '2-1' → { year: 2, term: 1 } */
export function parseSemesterKey(key) {
  const match = /^([1-4])-([12])$/.exec(String(key));
  if (!match) {
    throw new Error(`Invalid semester key: ${key}`);
  }
  return { year: Number(match[1]), term: Number(match[2]) };
}

/** 학기 순서 비교용 정수. '1-1' → 0, '4-2' → 7 */
export function semesterOrder(key) {
  const { year, term } = parseSemesterKey(key);
  return (year - 1) * 2 + (term - 1);
}

/** '2-1' → '2학년 1학기' */
export function formatSemester(key) {
  const { year, term } = parseSemesterKey(key);
  return `${year}학년 ${term}학기`;
}

/** 과목 ID → 배치된 학기 키. 같은 과목이 여러 학기에 있으면 가장 이른 학기를 씁니다. */
export function indexPlacements(plan) {
  const placements = new Map();
  for (const [key, courseIds] of Object.entries(plan.semesters ?? {})) {
    for (const id of courseIds) {
      const previous = placements.get(id);
      if (previous === undefined || semesterOrder(key) < semesterOrder(previous)) {
        placements.set(id, key);
      }
    }
  }
  return placements;
}

/** 과목 ID 목록의 학점 합계. 중복된 ID와 카탈로그에 없는 ID는 세지 않습니다. */
export function sumCredits(courseIds, catalog) {
  let total = 0;
  for (const id of new Set(courseIds)) {
    total += catalog[id]?.credits ?? 0;
  }
  return total;
}

/**
 * 선수 과목 위반 목록
 * - order:   선수 과목이 같은 학기 또는 더 늦은 학기에 있음
 * - missing: 선수 과목이 계획 어디에도 없음
 */
export function findPrerequisiteIssues(plan, catalog) {
  const placements = indexPlacements(plan);
  const issues = [];

  for (const [courseId, semester] of placements) {
    for (const prerequisiteId of catalog[courseId]?.prerequisites ?? []) {
      const prerequisiteSemester = placements.get(prerequisiteId);
      if (prerequisiteSemester === undefined) {
        issues.push({ kind: 'missing', courseId, prerequisiteId, semester });
      } else if (semesterOrder(prerequisiteSemester) >= semesterOrder(semester)) {
        issues.push({ kind: 'order', courseId, prerequisiteId, semester, prerequisiteSemester });
      }
    }
  }

  return issues;
}

/** 학기별 학점과 상한 초과 여부 */
export function summarizeSemesters(plan, catalog, maxCreditsPerSemester = Infinity) {
  return SEMESTER_KEYS.map((key) => {
    const credits = sumCredits(plan.semesters?.[key] ?? [], catalog);
    return { key, credits, overLimit: credits > maxCreditsPerSemester };
  });
}

/**
 * 이수요건 판정
 *
 * 각 항목은 status를 가집니다: 'met' | 'unmet'
 * 데이터가 없어 판단할 수 없는 항목은 'unknown'으로 두고 절대 충족 처리하지 않습니다.
 *
 * @returns {{ items: Array<{ id, label, status, current?, required?, missing? }>, passed: boolean }}
 */
export function evaluatePlan(plan, catalog, requirements) {
  const placements = indexPlacements(plan);
  const placedIds = [...placements.keys()].filter((id) => catalog[id]);
  const majorCredits = sumCredits(placedIds, catalog);
  const electiveCredits = sumCredits(
    placedIds.filter((id) => catalog[id].type === '전선'),
    catalog,
  );
  const missingRequired = (requirements.requiredCourses ?? []).filter((id) => !placements.has(id));
  const prerequisiteIssues = findPrerequisiteIssues(plan, catalog);
  const overloaded = summarizeSemesters(plan, catalog, requirements.maxCreditsPerSemester).filter(
    (semester) => semester.overLimit,
  );

  const items = [
    creditItem('major-credits', '전공 학점', majorCredits, requirements.majorCredits),
    {
      id: 'required-courses',
      label: '전공필수 과목',
      status: missingRequired.length === 0 ? 'met' : 'unmet',
      current: (requirements.requiredCourses?.length ?? 0) - missingRequired.length,
      required: requirements.requiredCourses?.length ?? 0,
      missing: missingRequired,
    },
    creditItem('elective-credits', '전공선택 학점', electiveCredits, requirements.electiveCredits),
    {
      id: 'prerequisites',
      label: '선수 과목 순서',
      status: prerequisiteIssues.length === 0 ? 'met' : 'unmet',
      issues: prerequisiteIssues,
    },
    {
      id: 'semester-load',
      label: '학기당 학점 상한',
      status: overloaded.length === 0 ? 'met' : 'unmet',
      overloaded,
    },
  ];

  return { items, passed: items.every((item) => item.status === 'met') };
}

function creditItem(id, label, current, required) {
  if (!Number.isFinite(required)) {
    return { id, label, status: 'unknown', current };
  }
  return { id, label, status: current >= required ? 'met' : 'unmet', current, required };
}
