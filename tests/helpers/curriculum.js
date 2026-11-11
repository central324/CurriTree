// 테스트용 교육과정 데이터 도우미
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const realCurriculumPath = new URL('../../data/curricula/ce-2023.json', import.meta.url);

export function loadRealCurriculum() {
  return JSON.parse(readFileSync(realCurriculumPath, 'utf8'));
}

// 계약을 지키는 작은 교육과정 (필요한 부분만 overrides로 바꿔 씁니다)
export function makeCurriculum(overrides = {}) {
  return {
    schemaVersion: 1,
    curriculumId: 'test-2026',
    department: { id: 'test', name: '테스트학과' },
    catalogYear: 2026,
    admissionYears: [2026],
    isDemo: true,
    source: { title: '테스트 데이터', url: null, verifiedAt: null },
    tags: ['bigdata-ai'],
    courses: [
      makeCourse({ id: 'a', name: '과목A' }),
      makeCourse({ id: 'b', name: '과목B', hardPrerequisiteIds: ['a'], recommendedTerm: '2-1' }),
    ],
    requirements: {
      minimumTotalCredits: null,
      minimumMajorCredits: null,
      minimumMajorElectiveCredits: null,
      requiredCourseIds: ['a'],
      maximumTermCredits: null,
    },
    ...overrides,
  };
}

export function makeCourse(overrides = {}) {
  return {
    id: 'course',
    name: '과목',
    aliases: [],
    courseCodes: [],
    credits: 3,
    category: 'major_required',
    recommendedTerm: '1-1',
    offeredTerms: ['1'],
    hardPrerequisiteIds: [],
    recommendedPreviousIds: [],
    linkedCourseIds: [],
    tags: ['bigdata-ai'],
    ...overrides,
  };
}

// { '파일명.json': 객체 또는 문자열 } 로 임시 교육과정 폴더를 만듭니다.
export function makeCurriculumDir(files) {
  const directory = mkdtempSync(join(tmpdir(), 'curritree-curricula-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(directory, name), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return { directory, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
