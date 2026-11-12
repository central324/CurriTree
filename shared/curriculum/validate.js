/**
 * 교육과정 JSON이 계약(docs/CONTRACT_CHECKLIST.md 2절)을 지키는지 검사하는 순수 함수입니다.
 *
 * validateCurriculum(data) → [{ field, reason }]
 *   - 빈 배열이면 정상입니다.
 *   - 화면·Express 객체에 의존하지 않으므로 브라우저·서버·테스트에서 그대로 쓸 수 있습니다.
 */
import {
  CATEGORIES,
  CURRICULUM_ID_PATTERN,
  DATE_PATTERN,
  DEPARTMENT_ID_PATTERN,
  OFFERED_TERMS,
  RECOMMENDED_TERM_PATTERN,
  REQUIREMENT_CREDIT_FIELDS,
  SCHEMA_VERSION,
  TAGS,
} from './schema.js';

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isCredit = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateCurriculum(data) {
  const errors = [];
  const fail = (field, reason) => errors.push({ field, reason });

  if (!isObject(data)) {
    fail('', '교육과정 데이터는 객체여야 합니다.');
    return errors;
  }

  // 1) 교육과정 기본 정보
  if (data.schemaVersion !== SCHEMA_VERSION) fail('schemaVersion', `${SCHEMA_VERSION}이어야 합니다.`);
  if (typeof data.curriculumId !== 'string' || !CURRICULUM_ID_PATTERN.test(data.curriculumId)) {
    fail('curriculumId', '소문자 영문·숫자와 하이픈으로 된 ID여야 합니다.');
  }
  if (!isObject(data.department)) {
    fail('department', '학과 객체가 필요합니다.');
  } else {
    if (typeof data.department.id !== 'string' || !DEPARTMENT_ID_PATTERN.test(data.department.id)) {
      fail('department.id', '소문자 영문으로 시작하는 학과 ID여야 합니다.');
    }
    if (!isNonEmptyString(data.department.name)) fail('department.name', '학과 이름이 필요합니다.');
  }
  if (!Number.isInteger(data.catalogYear)) fail('catalogYear', '정수 연도여야 합니다.');
  if (!Array.isArray(data.admissionYears) || !data.admissionYears.every(Number.isInteger)) {
    fail('admissionYears', '정수 연도 배열이어야 합니다.');
  }
  if (typeof data.isDemo !== 'boolean') fail('isDemo', 'true 또는 false여야 합니다.');

  // 2) 출처: 실제 데이터(isDemo: false)는 URL 필수
  if (!isObject(data.source)) {
    fail('source', '출처 객체가 필요합니다.');
  } else {
    if (!isNonEmptyString(data.source.title)) fail('source.title', '출처 제목이 필요합니다.');
    if (data.source.url !== null && !isNonEmptyString(data.source.url)) fail('source.url', '문자열 또는 null이어야 합니다.');
    if (data.source.verifiedAt !== null && !(typeof data.source.verifiedAt === 'string' && DATE_PATTERN.test(data.source.verifiedAt))) {
      fail('source.verifiedAt', 'YYYY-MM-DD 형식 또는 null이어야 합니다.');
    }
    if (data.isDemo === false && !isNonEmptyString(data.source.url)) {
      fail('source.url', '실제 데이터(isDemo: false)에는 공식 출처 URL이 필요합니다.');
    }
    if (data.isDemo === false && data.source.verifiedAt === null) {
      fail('source.verifiedAt', '실제 데이터(isDemo: false)에는 확인 날짜가 필요합니다.');
    }
  }

  // 3) 진로 태그 목록
  const curriculumTags = new Set();
  if (!isStringArray(data.tags)) {
    fail('tags', '문자열 배열이어야 합니다.');
  } else {
    data.tags.forEach((tag, index) => {
      if (!TAGS.includes(tag)) fail(`tags[${index}]`, `허용되지 않은 진로 태그: ${tag}`);
      curriculumTags.add(tag);
    });
  }

  // 4) 과목
  if (!Array.isArray(data.courses)) {
    fail('courses', '과목 배열이 필요합니다.');
    return errors;
  }

  const ids = new Set();
  data.courses.forEach((course, index) => {
    const at = `courses[${index}]`;
    if (!isObject(course)) {
      fail(at, '과목은 객체여야 합니다.');
      return;
    }
    if (typeof course.id !== 'string' || !CURRICULUM_ID_PATTERN.test(course.id)) {
      fail(`${at}.id`, '소문자 영문·숫자와 하이픈으로 된 ID여야 합니다.');
    } else if (ids.has(course.id)) {
      fail(`${at}.id`, `중복된 과목 ID: ${course.id}`);
    } else {
      ids.add(course.id);
    }
  });

  data.courses.forEach((course, index) => {
    if (!isObject(course)) return;
    const at = `courses[${index}]`;

    if (!isNonEmptyString(course.name)) fail(`${at}.name`, '과목명이 필요합니다.');
    // 확인된 값이 없으면 [] — null이나 생략은 허용하지 않음
    if (!isStringArray(course.aliases)) fail(`${at}.aliases`, '문자열 배열이어야 합니다(없으면 []).');
    if (!isStringArray(course.courseCodes)) fail(`${at}.courseCodes`, '문자열 배열이어야 합니다(없으면 []).');
    if (!isCredit(course.credits)) fail(`${at}.credits`, '0 이상의 숫자여야 합니다.');
    if (!CATEGORIES.includes(course.category)) fail(`${at}.category`, `허용되지 않은 이수구분: ${course.category}`);

    if (course.recommendedTerm !== null && !(typeof course.recommendedTerm === 'string' && RECOMMENDED_TERM_PATTERN.test(course.recommendedTerm))) {
      fail(`${at}.recommendedTerm`, '1-1 ~ 4-2 형식 또는 null이어야 합니다.');
    }
    if (course.offeredTerms !== null && !(isStringArray(course.offeredTerms) && course.offeredTerms.every((term) => OFFERED_TERMS.includes(term)))) {
      fail(`${at}.offeredTerms`, '"1", "2", "S", "W" 배열 또는 null이어야 합니다.');
    }

    // 선수 관계: null(미확인)과 [](없음 확인)을 구분하고, 존재하는 과목만 참조
    if (course.hardPrerequisiteIds !== null) {
      checkReferences(course.hardPrerequisiteIds, `${at}.hardPrerequisiteIds`, course.id);
    }
    checkReferences(course.recommendedPreviousIds, `${at}.recommendedPreviousIds`, course.id);
    // 연계 과목(설계↔실습): 선후 관계가 아니므로 양쪽 과목에 서로 적어야 합니다.
    checkReferences(course.linkedCourseIds, `${at}.linkedCourseIds`, course.id);
    if (isStringArray(course.linkedCourseIds)) {
      course.linkedCourseIds.forEach((id, linkIndex) => {
        const partner = data.courses.find((item) => isObject(item) && item.id === id);
        if (partner && id !== course.id && !(Array.isArray(partner.linkedCourseIds) && partner.linkedCourseIds.includes(course.id))) {
          fail(`${at}.linkedCourseIds[${linkIndex}]`, `연계 과목은 양방향이어야 합니다: ${id}에도 ${course.id}가 필요합니다.`);
        }
      });
    }

    if (!isStringArray(course.tags)) {
      fail(`${at}.tags`, '문자열 배열이어야 합니다.');
    } else {
      course.tags.forEach((tag) => {
        if (!curriculumTags.has(tag)) fail(`${at}.tags`, `교육과정 tags에 없는 진로 태그: ${tag}`);
      });
    }
  });

  findPrerequisiteCycle(data.courses).forEach((cycle) => {
    fail('courses', `필수 선수 관계가 순환합니다: ${cycle.join(' → ')}`);
  });

  // 5) 이수요건: null(미확인)·0·양수를 구분
  if (!isObject(data.requirements)) {
    fail('requirements', '이수요건 객체가 필요합니다.');
  } else {
    for (const field of REQUIREMENT_CREDIT_FIELDS) {
      const value = data.requirements[field];
      if (value !== null && !isCredit(value)) fail(`requirements.${field}`, '0 이상의 숫자 또는 null이어야 합니다.');
    }
    if (data.requirements.requiredCourseIds !== null) {
      checkReferences(data.requirements.requiredCourseIds, 'requirements.requiredCourseIds');
    }
  }

  return errors;

  function checkReferences(list, field, selfId) {
    if (!isStringArray(list)) {
      fail(field, '과목 ID 배열이어야 합니다.');
      return;
    }
    list.forEach((id, index) => {
      if (!ids.has(id)) fail(`${field}[${index}]`, `존재하지 않는 과목 ID: ${id}`);
      else if (id === selfId) fail(`${field}[${index}]`, '자기 자신을 참조할 수 없습니다.');
    });
  }
}

// 필수 선수 관계(hardPrerequisiteIds)의 순환을 찾습니다. 찾은 순환마다 과목 ID 경로를 돌려줍니다.
export function findPrerequisiteCycle(courses) {
  const graph = new Map();
  for (const course of courses) {
    if (isObject(course) && typeof course.id === 'string') {
      graph.set(course.id, Array.isArray(course.hardPrerequisiteIds) ? course.hardPrerequisiteIds : []);
    }
  }

  const cycles = [];
  const state = new Map(); // 1: 방문 중, 2: 완료
  const path = [];

  const visit = (id) => {
    state.set(id, 1);
    path.push(id);
    for (const next of graph.get(id) ?? []) {
      if (!graph.has(next)) continue;
      if (state.get(next) === 1) cycles.push([...path.slice(path.indexOf(next)), next]);
      else if (!state.has(next)) visit(next);
    }
    path.pop();
    state.set(id, 2);
  };

  for (const id of graph.keys()) {
    if (!state.has(id)) visit(id);
  }
  return cycles;
}
