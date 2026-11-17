// 실제 교육과정(ce-2023.json)의 학정번호로 KLAS 과목이 매칭되는지 확인 (PR #30 리뷰)
import test from 'node:test';
import assert from 'node:assert/strict';

import { extractSubjectCode } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { loadRealCurriculum } from './helpers/curriculum.js';

const curriculum = loadRealCurriculum();

// KLAS 학정번호(분반 포함)와 과목명으로 매칭 결과를 구합니다.
function matchOne(courseCode, name) {
  const rows = [
    {
      clientRowId: 'local-001',
      name,
      subjectCode: extractSubjectCode(courseCode),
      match: { status: 'unmatched', courseId: null },
    },
  ];

  return matchParsedCourses(rows, curriculum);
}

test('분반을 뺀 학정번호로 데이터구조설계가 매칭된다', () => {
  assert.equal(extractSubjectCode('I020-2-3703-01'), 'I020-2-3703');

  const result = matchOne('I020-2-3703-01', '데이터구조설계');

  assert.deepEqual(result.courses[0].match, {
    status: 'exact',
    courseId: 'data-structure-design',
  });
  assert.deepEqual(result.reviewIssues, []);
});

test('과목명이 바뀌어도 학정번호로 매칭된다 (동일교과목 별칭)', () => {
  const result = matchOne('I020-2-5465-01', '디지털전자회로');

  assert.equal(result.courses[0].match.status, 'exact');
  assert.equal(result.courses[0].match.courseId, 'electronic-circuits');
});

test('개설학과 공통 학정번호로 공학설계입문이 매칭된다', () => {
  const result = matchOne('I000-1-2957-03', '공학설계입문');

  assert.equal(result.courses[0].match.courseId, 'eng-design-intro');
});

test('데이터의 모든 학정번호가 자기 과목 하나로만 매칭된다', () => {
  for (const course of curriculum.courses) {
    for (const code of course.courseCodes) {
      const result = matchOne(`${code}-01`, course.name);

      assert.deepEqual(
        result.courses[0].match,
        { status: 'exact', courseId: course.id },
        `${course.name} (${code})`
      );
    }
  }
});
