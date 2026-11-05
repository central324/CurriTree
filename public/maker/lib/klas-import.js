/**
 * KLAS 성적조회 화면에서 복사한 텍스트를 읽어 수강 계획으로 바꿉니다.
 *
 * - 브라우저에서만 실행합니다. 붙여 넣은 내용은 서버로 보내지 않고, 성적은 저장하지 않습니다.
 * - 과목은 교육과정 데이터의 과목명과 맞춰 찾습니다. (띄어쓰기·괄호·로마숫자 차이는 무시)
 * - 학기 줄(예: "2024학년도 1학기", "2024-2", "2024 여름학기")을 찾아 그 아래 과목을 그 학기로 봅니다.
 * - 정규 학기를 오래된 순서로 1학년 1학기, 1학년 2학기 …에 차례로 넣습니다. (휴학 학기는 건너뜀)
 *   계절학기 과목은 바로 앞 정규 학기에 넣습니다.
 * - 성적이 있으면 이수 완료, 성적 칸이 비어 있으면 수강 중, F·NP는 미이수로 처리합니다.
 *
 * ⚠️ 실제 KLAS 복사 형식으로 계속 검증해야 합니다. 새 형식을 발견하면 예시를 모아
 *    단위 테스트를 추가하고 규칙을 보완하세요.
 */
import { SEMESTER_KEYS } from './plan-rules.js';

const SEASON_ORDER = { 1: 1, summer: 2, 2: 3, winter: 4 };
const SEASON_LABEL = { 1: '1학기', summer: '여름학기', 2: '2학기', winter: '겨울학기' };
const FAILED_GRADES = new Set(['F', 'NP', 'U']);
const GRADE_PATTERN = /(?:^|\s)(A\+|A0|A|B\+|B0|B|C\+|C0|C|D\+|D0|D|F|P|NP|S|U)(?=\s|$)/;
const HEADER_WORDS = /과목명|학정번호|이수구분|교과목명|평점|성적구분/;

/** 비교용 과목명: 공백·기호를 지우고 로마숫자를 아라비아 숫자로 */
export function normalizeName(name) {
  return String(name)
    .replace(/Ⅰ/g, '1')
    .replace(/Ⅱ/g, '2')
    .replace(/Ⅲ/g, '3')
    .replace(/Ⅳ/g, '4')
    .replace(/[\s()[\]{}·•.,:;'"_\-–—]/g, '')
    .toLowerCase();
}

/**
 * 한 줄에서 학기를 찾습니다.
 * @returns {{ year: number, season: 1 | 2 | 'summer' | 'winter' } | null}
 */
export function findTerm(line) {
  const text = String(line);
  const seasonal = /(20\d{2})\s*(?:학년도|년도|년)?\s*[-./]?\s*(여름|하계|겨울|동계)/.exec(text);
  if (seasonal) {
    const summer = seasonal[2] === '여름' || seasonal[2] === '하계';
    return { year: Number(seasonal[1]), season: summer ? 'summer' : 'winter' };
  }
  const regular =
    /(20\d{2})\s*(?:학년도|년도|년)\s*([12])\s*학기/.exec(text) ??
    /(20\d{2})\s+([12])\s*학기/.exec(text) ??
    /(20\d{2})\s*[-./]\s*([12])(?![\d])/.exec(text);
  if (regular) {
    return { year: Number(regular[1]), season: Number(regular[2]) };
  }
  return null;
}

function termKey(term) {
  return `${term.year}-${term.season}`;
}

export function formatTerm(term) {
  return `${term.year}년 ${SEASON_LABEL[term.season]}`;
}

function compareTerms(a, b) {
  return a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season];
}

/**
 * 텍스트 → 학기별 과목 목록
 *
 * @param {string} text  붙여 넣은 KLAS 텍스트
 * @param {Array<{ id: string, name: string }>} courses  교육과정 과목 목록
 */
export function parseTranscript(text, courses) {
  const candidates = courses
    .map((course) => ({ course, key: normalizeName(course.name) }))
    .filter((item) => item.key)
    .sort((a, b) => b.key.length - a.key.length); // '자료구조설계'가 '자료구조'보다 먼저 맞도록

  const terms = new Map();
  const unmatched = [];
  const noTerm = [];
  let currentTerm = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const term = findTerm(line);
    const normalizedLine = normalizeName(line);
    const match = candidates.find((item) => normalizedLine.includes(item.key));

    if (term && !match) {
      currentTerm = term;
      continue;
    }

    const rowTerm = term ?? currentTerm;
    if (!match) {
      if (looksLikeCourseRow(line)) unmatched.push({ text: line, term: rowTerm });
      continue;
    }

    const grade = GRADE_PATTERN.exec(line.replace(match.course.name, ' '))?.[1] ?? null;
    const entry = {
      id: match.course.id,
      name: match.course.name,
      grade,
      status: grade === null ? 'in-progress' : FAILED_GRADES.has(grade) ? 'failed' : 'completed',
    };

    if (!rowTerm) {
      noTerm.push(entry);
      continue;
    }
    const key = termKey(rowTerm);
    if (!terms.has(key)) terms.set(key, { ...rowTerm, courses: [] });
    terms.get(key).courses.push(entry);
  }

  return {
    terms: [...terms.values()].sort(compareTerms),
    unmatched,
    noTerm,
  };
}

function looksLikeCourseRow(line) {
  if (HEADER_WORDS.test(line) || findTerm(line)) return false;
  const cells = line.split(/\t|\s{2,}/).filter(Boolean);
  return /[가-힣]/.test(line) && (cells.length >= 3 || GRADE_PATTERN.test(line));
}

/**
 * 학기별 과목 목록 → 커리메이커 계획
 *
 * @returns {{
 *   semesters: Record<string, string[]>,   // '1-1': ['PF', ...]
 *   inProgress: string[],                  // 수강 중인 과목 ID
 *   currentSemester: string | null,        // 지금 다니는 학기로 쓸 키
 *   mapping: Array<{ label: string, key: string }>,
 *   warnings: string[],
 * }}
 */
export function toPlan(parsed) {
  const warnings = [];
  const regular = parsed.terms.filter((term) => term.season === 1 || term.season === 2);
  const mapping = new Map();

  regular.forEach((term, index) => {
    const key = SEMESTER_KEYS[Math.min(index, SEMESTER_KEYS.length - 1)];
    if (index >= SEMESTER_KEYS.length) {
      warnings.push(`${formatTerm(term)}은 8번째 학기 이후라 4학년 2학기에 넣었습니다.`);
    }
    mapping.set(termKey(term), key);
  });

  for (const term of parsed.terms) {
    if (mapping.has(termKey(term))) continue;
    const before = regular.filter((item) => compareTerms(item, term) < 0).at(-1);
    const target = before ?? regular[0];
    if (target) {
      mapping.set(termKey(term), mapping.get(termKey(target)));
    } else {
      warnings.push(`${formatTerm(term)} 과목은 넣을 정규 학기가 없어 제외했습니다.`);
    }
  }

  // 같은 과목을 여러 번 들었으면(재수강) 가장 최근의 이수·수강 중 기록을 씁니다.
  const latest = new Map();
  for (const term of parsed.terms) {
    const key = mapping.get(termKey(term));
    if (!key) continue;
    for (const course of term.courses) {
      if (course.status === 'failed') continue;
      latest.set(course.id, { key, status: course.status });
    }
  }

  const semesters = {};
  const inProgress = [];
  for (const [id, { key, status }] of latest) {
    (semesters[key] ??= []).push(id);
    if (status === 'in-progress') inProgress.push(id);
  }

  let currentSemester = null;
  if (inProgress.length) {
    currentSemester = latest.get(inProgress.at(-1)).key;
  } else if (regular.length) {
    const lastIndex = Math.min(regular.length, SEMESTER_KEYS.length - 1);
    currentSemester = SEMESTER_KEYS[lastIndex];
  }

  if (parsed.noTerm.length) {
    warnings.push(`학기를 알 수 없는 과목 ${parsed.noTerm.length}개는 제외했습니다. 학기 줄이 함께 복사됐는지 확인하세요.`);
  }

  return {
    semesters,
    inProgress,
    currentSemester,
    mapping: parsed.terms
      .filter((term) => mapping.has(termKey(term)))
      .map((term) => ({ label: formatTerm(term), key: mapping.get(termKey(term)) })),
    warnings,
  };
}
