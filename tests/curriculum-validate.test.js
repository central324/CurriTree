// 교육과정 JSON 계약 검사 (docs/CONTRACT_CHECKLIST.md 9.1)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateCurriculum } from '../shared/curriculum/validate.js';
import { loadRealCurriculum, makeCourse, makeCurriculum } from './helpers/curriculum.js';

const reasons = (data) => validateCurriculum(data).map((error) => `${error.field}: ${error.reason}`);
const fieldsOf = (data) => validateCurriculum(data).map((error) => error.field);

describe('실제 교육과정 데이터 (data/curricula/ce-2026.json)', () => {
  const data = loadRealCurriculum();

  test('계약을 모두 지킨다', () => {
    assert.deepEqual(reasons(data), []);
  });

  test('편성표 합계 115학점, 43과목과 일치한다', () => {
    assert.equal(data.courses.length, 43);
    assert.equal(
      data.courses.reduce((sum, course) => sum + course.credits, 0),
      115,
    );
  });

  test('모든 과목이 3개 트랙 중 하나 이상에 속한다', () => {
    for (const course of data.courses) {
      assert.ok(course.tags.length > 0, course.id);
    }
  });

  test('전공필수 과목은 모두 requiredCourseIds에 있다', () => {
    const required = data.courses.filter((course) => course.category === 'major_required').map((course) => course.id);
    assert.deepEqual([...data.requirements.requiredCourseIds].sort(), required.sort());
  });
});

describe('정상 데이터', () => {
  test('작은 예시 데이터는 오류가 없다', () => {
    assert.deepEqual(reasons(makeCurriculum()), []);
  });

  test('hardPrerequisiteIds: null(미확인)과 [](없음)은 모두 허용된다', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', hardPrerequisiteIds: null }), makeCourse({ id: 'b', hardPrerequisiteIds: [] })] });
    assert.deepEqual(reasons(data), []);
  });

  test('requiredCourseIds: null과 []는 모두 허용된다', () => {
    for (const requiredCourseIds of [null, []]) {
      const data = makeCurriculum();
      data.requirements.requiredCourseIds = requiredCourseIds;
      assert.deepEqual(reasons(data), []);
    }
  });

  test('offeredTerms: null과 []는 모두 허용된다', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', offeredTerms: null }), makeCourse({ id: 'b', offeredTerms: [] })] });
    assert.deepEqual(reasons(data), []);
  });

  test('aliases·courseCodes가 []이면 정상이다', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', aliases: [], courseCodes: [] })] });
    data.requirements.requiredCourseIds = [];
    assert.deepEqual(reasons(data), []);
  });

  test('isDemo: false에 URL과 확인 날짜가 있으면 정상이다', () => {
    const data = makeCurriculum({ isDemo: false, source: { title: '공식', url: 'https://example.com', verifiedAt: '2026-11-08' } });
    assert.deepEqual(reasons(data), []);
  });
});

describe('오류 데이터', () => {
  test('필수 필드 누락 (교육과정·과목)', () => {
    for (const field of ['schemaVersion', 'curriculumId', 'department', 'catalogYear', 'admissionYears', 'isDemo', 'source', 'tags', 'courses', 'requirements']) {
      const data = makeCurriculum();
      delete data[field];
      assert.ok(fieldsOf(data).includes(field), field);
    }
    for (const field of ['id', 'name', 'aliases', 'courseCodes', 'credits', 'category', 'recommendedTerm', 'offeredTerms', 'hardPrerequisiteIds', 'recommendedPreviousIds', 'tags']) {
      const course = makeCourse({ id: 'x' });
      delete course[field];
      const data = makeCurriculum({ courses: [course] });
      data.requirements.requiredCourseIds = [];
      assert.ok(fieldsOf(data).some((name) => name.startsWith(`courses[0].${field}`)), field);
    }
  });

  test('중복 과목 ID', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a' }), makeCourse({ id: 'a' })] });
    assert.ok(fieldsOf(data).includes('courses[1].id'));
  });

  test('존재하지 않는 필수 선수 과목', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', hardPrerequisiteIds: ['ghost'] })] });
    assert.ok(fieldsOf(data).includes('courses[0].hardPrerequisiteIds[0]'));
  });

  test('존재하지 않는 권장 선행 과목', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', recommendedPreviousIds: ['ghost'] })] });
    assert.ok(fieldsOf(data).includes('courses[0].recommendedPreviousIds[0]'));
  });

  test('존재하지 않는 필수 이수 과목', () => {
    const data = makeCurriculum();
    data.requirements.requiredCourseIds = ['ghost'];
    assert.ok(fieldsOf(data).includes('requirements.requiredCourseIds[0]'));
  });

  test('recommendedPreviousIds는 null을 허용하지 않는다', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', recommendedPreviousIds: null })] });
    assert.ok(fieldsOf(data).includes('courses[0].recommendedPreviousIds'));
  });

  test('필수 선수 관계 순환', () => {
    const data = makeCurriculum({
      courses: [
        makeCourse({ id: 'a', hardPrerequisiteIds: ['c'] }),
        makeCourse({ id: 'b', hardPrerequisiteIds: ['a'] }),
        makeCourse({ id: 'c', hardPrerequisiteIds: ['b'] }),
      ],
    });
    assert.ok(reasons(data).some((reason) => reason.includes('순환')));
  });

  test('recommendedTerm 형식 오류', () => {
    for (const recommendedTerm of ['5-1', '1-3', '2026-1', '']) {
      const data = makeCurriculum({ courses: [makeCourse({ id: 'a', recommendedTerm })] });
      assert.ok(fieldsOf(data).includes('courses[0].recommendedTerm'), recommendedTerm);
    }
  });

  test('offeredTerms 허용값 오류', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', offeredTerms: ['spring'] })] });
    assert.ok(fieldsOf(data).includes('courses[0].offeredTerms'));
  });

  test('aliases·courseCodes가 null이면 오류', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', aliases: null, courseCodes: null })] });
    const fields = fieldsOf(data);
    assert.ok(fields.includes('courses[0].aliases'));
    assert.ok(fields.includes('courses[0].courseCodes'));
  });

  test('잘못된 이수구분', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', category: '전필' })] });
    assert.ok(fieldsOf(data).includes('courses[0].category'));
  });

  test('허용되지 않은 진로 태그', () => {
    assert.ok(fieldsOf(makeCurriculum({ tags: ['ai'] })).includes('tags[0]'));
  });

  test('교육과정 tags에 없는 과목 태그', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', tags: ['hw-sw-convergence'] })] });
    assert.ok(fieldsOf(data).includes('courses[0].tags'));
  });

  test('isDemo: false인데 출처 URL이 없음', () => {
    const data = makeCurriculum({ isDemo: false });
    assert.ok(fieldsOf(data).includes('source.url'));
  });

  test('isDemo: false인데 확인 날짜가 없음', () => {
    const data = makeCurriculum({ isDemo: false, source: { title: '공식', url: 'https://example.com', verifiedAt: null } });
    assert.ok(fieldsOf(data).includes('source.verifiedAt'));
  });

  test('source.verifiedAt 날짜 형식 오류', () => {
    const data = makeCurriculum({ source: { title: '테스트', url: null, verifiedAt: '2026/11/08' } });
    assert.ok(fieldsOf(data).includes('source.verifiedAt'));
  });

  test('학과·교육과정 ID 형식 오류', () => {
    const data = makeCurriculum({ curriculumId: 'Test_2026', department: { id: '1ce', name: '학과' } });
    const fields = fieldsOf(data);
    assert.ok(fields.includes('curriculumId'));
    assert.ok(fields.includes('department.id'));
  });

  test('이수요건 학점이 음수이거나 문자열이면 오류 (null은 허용)', () => {
    const data = makeCurriculum();
    data.requirements.minimumTotalCredits = -1;
    data.requirements.minimumMajorCredits = '60';
    const fields = fieldsOf(data);
    assert.ok(fields.includes('requirements.minimumTotalCredits'));
    assert.ok(fields.includes('requirements.minimumMajorCredits'));
  });
});
