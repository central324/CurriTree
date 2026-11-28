// 교육과정 JSON 계약 검사 (docs/CONTRACT_CHECKLIST.md 9.1)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateCurriculum } from '../shared/curriculum/validate.js';
import { loadRealCurriculum, makeCourse, makeCurriculum } from './helpers/curriculum.js';

const reasons = (data) => validateCurriculum(data).map((error) => `${error.field}: ${error.reason}`);
const fieldsOf = (data) => validateCurriculum(data).map((error) => error.field);
// 기존 2023학년도 교과과정표 외에 추가로 확인된 과목
const supplementalCourseIds = new Set([
  'discrete-mathematics',
  'career-exploration-design',
  'numerical-analysis',
]);

describe('실제 교육과정 데이터 (data/curricula/ce-2023.json)', () => {
  const data = loadRealCurriculum();

  test('계약을 모두 지킨다', () => {
    assert.deepEqual(reasons(data), []);
  });

  test('기존 2023학년도 교과과정표 42과목·113학점을 유지한다', () => {
    const tableCourses = data.courses.filter(
      (course) =>
        course.id !== 'eng-design-intro' &&
        !supplementalCourseIds.has(course.id)
    );

    assert.equal(tableCourses.length, 42);
    assert.equal(
      tableCourses.reduce((sum, course) => sum + course.credits, 0),
      113,
    );
  });

  test('보완된 전공선택 과목의 학정번호와 학점이 올바르다', () => {
    const expectedCourses = [
      {
        id: 'discrete-mathematics',
        name: '이산수학',
        courseCode: 'I000-2-1186',
        credits: 3,
      },
      {
        id: 'career-exploration-design',
        name: '진로탐색및설계',
        courseCode: 'I020-2-1234',
        credits: 1,
      },
      {
        id: 'numerical-analysis',
        name: '수치해석',
        courseCode: '7000-3-0875',
        credits: 3,
      },
    ];

    for (const expected of expectedCourses) {
      const course = data.courses.find(
        (item) => item.id === expected.id
      );

      assert.ok(course, expected.id);
      assert.equal(course.name, expected.name);
      assert.ok(course.courseCodes.includes(expected.courseCode));
      assert.equal(course.credits, expected.credits);
      assert.equal(course.category, 'major_elective');
      assert.ok(!data.requirements.requiredCourseIds.includes(course.id));
    }
  });

  test('공학설계입문은 1학년 전공선택 3학점 과목이다', () => {
    const course = data.courses.find(
      (item) => item.id === 'eng-design-intro'
    );

    assert.ok(course);
    assert.equal(course.recommendedTerm, '1');
    assert.deepEqual(course.offeredTerms, ['1', '2']);
    assert.equal(course.category, 'major_elective');
    assert.equal(course.credits, 3);

    assert.ok(
      !data.requirements.requiredCourseIds.includes(course.id)
    );
  });

  test('기존 로드맵 과목에는 하나 이상의 진로 태그가 있다', () => {
    const roadmapCourses = data.courses.filter(
      (course) =>
        course.id !== 'ai-programming' &&
        !supplementalCourseIds.has(course.id)
    );

    for (const course of roadmapCourses) {
      assert.ok(course.tags.length > 0, course.id);
    }
  });

  test('이수체계도의 필수 선수 관계(빨간 화살표)를 담는다', () => {
    const hard = Object.fromEntries(data.courses.map((course) => [course.id, course.hardPrerequisiteIds]));
    assert.deepEqual(hard['digital-logic-2'], ['digital-logic-1']);
    assert.deepEqual(hard['oop-design'], ['eng-design-intro']);
    assert.deepEqual(hard['capstone-1'], ['oop-design']);
    assert.deepEqual(hard['sw-project-1'], ['oss-design-lab']);
    // 선수 과목(대학수학및연습2)이 데이터에 없어 미확인
    assert.equal(hard['signals-systems'], null);
  });

  test('설계·실습 연계 과목은 양쪽에 서로 등록되어 있다', () => {
    const linked = Object.fromEntries(data.courses.map((course) => [course.id, course.linkedCourseIds]));
    assert.deepEqual(linked['oop-design'], ['oop-lab']);
    assert.deepEqual(linked['oop-lab'], ['oop-design']);
    assert.deepEqual(linked['data-structure-design'], ['data-structure-lab']);
  });

  test('2023학번 졸업 학점: 총 133학점, 전공 60학점 (확인 못 한 값은 null)', () => {
    assert.equal(data.requirements.minimumTotalCredits, 133);
    assert.equal(data.requirements.minimumMajorCredits, 60);
    assert.equal(data.requirements.minimumMajorElectiveCredits, null);
    assert.equal(data.requirements.maximumTermCredits, null);
  });

  test('학정번호는 분반을 뺀 형식이고 과목끼리 겹치지 않는다', () => {
    const seen = new Map();
    for (const course of data.courses) {
      for (const code of course.courseCodes) {
        assert.match(code, /^(?:[A-Z]\d{3}|\d{4})-\d-\d{4}$/, `${course.id}: ${code}`);
        assert.ok(!seen.has(code), `${code}: ${seen.get(code)}, ${course.id}`);
        seen.set(code, course.id);
      }
    }
    assert.ok(seen.size > 0);
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
    for (const field of ['id', 'name', 'aliases', 'courseCodes', 'credits', 'category', 'recommendedTerm', 'offeredTerms', 'hardPrerequisiteIds', 'recommendedPreviousIds', 'linkedCourseIds', 'tags']) {
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

  test('존재하지 않는 연계 과목', () => {
    const data = makeCurriculum({ courses: [makeCourse({ id: 'a', linkedCourseIds: ['ghost'] })] });
    assert.ok(fieldsOf(data).includes('courses[0].linkedCourseIds[0]'));
  });

  test('연계 과목을 한쪽에만 적으면 오류', () => {
    const data = makeCurriculum({
      courses: [makeCourse({ id: 'a', linkedCourseIds: ['b'] }), makeCourse({ id: 'b' })],
    });
    assert.ok(fieldsOf(data).includes('courses[0].linkedCourseIds[0]'));
  });

  test('연계 과목을 양쪽에 적으면 정상', () => {
    const data = makeCurriculum({
      courses: [makeCourse({ id: 'a', linkedCourseIds: ['b'] }), makeCourse({ id: 'b', linkedCourseIds: ['a'] })],
    });
    assert.deepEqual(reasons(data), []);
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

  test('recommendedTerm은 학년만(1 ~ 4) 적어도 된다', () => {
    for (const recommendedTerm of ['1', '4', '2-1', null]) {
      const data = makeCurriculum({ courses: [makeCourse({ id: 'a', recommendedTerm })] });
      assert.ok(!fieldsOf(data).includes('courses[0].recommendedTerm'), String(recommendedTerm));
    }
  });

  test('recommendedTerm 형식 오류', () => {
    for (const recommendedTerm of ['5-1', '1-3', '2026-1', '', '5', '1-', '0']) {
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
