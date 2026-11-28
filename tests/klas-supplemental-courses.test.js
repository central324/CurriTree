// 추가 전공선택 과목의 KLAS 매칭 및 학점 반영 검증
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { buildMakerPlan } from '../public/klas/plan.js';
import { validatePlan } from '../shared/maker/validation.js';
import { buildDegreeProgress } from '../public/maker/degree-progress.js';
import { loadRealCurriculum } from './helpers/curriculum.js';

const curriculum = loadRealCurriculum();

// 테스트용 KLAS 과목 행
function klasRow(code, name, category, credits, grade) {
  return [
    code,
    name,
    '',
    category,
    String(credits),
    grade,
    '',
    '',
    '',
  ].join('\t');
}

// 실제 KLAS 화면과 동일한 순서로 처리
function processKlasText(rawText) {
  const parsed = parseKlasText(rawText, {
    currentTermId: '2026-2',
  });

  const majorRows = parsed.courses.filter(
    (course) =>
      course.category === 'major_required' ||
      course.category === 'major_elective'
  );

  const matched = matchParsedCourses(
    majorRows,
    curriculum
  );

  const matchedMap = new Map(
    matched.courses.map((course) => [
      course.clientRowId,
      course,
    ])
  );

  const rows = parsed.courses.map(
    (course) =>
      matchedMap.get(course.clientRowId) ?? course
  );

  const result = buildMakerPlan(rows, curriculum);
  const validation = validatePlan(
    result.plan,
    curriculum
  );

  return {
    parsed,
    matched,
    rows,
    ...result,
    validation,
  };
}

test('누락됐던 두 전공선택 과목이 학정번호로 매칭된다', () => {
  const rawText = [
    '2026학년도 1학기',
    klasRow(
      'I020-2-1234-01',
      '진로탐색및설계',
      '전선',
      1,
      'P'
    ),
    '2026학년도 2학기',
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '전선',
      3,
      ''
    ),
  ].join('\n');

  const result = processKlasText(rawText);

  assert.deepEqual(result.parsed.warnings, []);
  assert.deepEqual(result.matched.reviewIssues, []);

  assert.deepEqual(result.rows[0].match, {
    status: 'exact',
    courseId: 'career-exploration-design',
  });

  assert.deepEqual(result.rows[1].match, {
    status: 'exact',
    courseId: 'discrete-mathematics',
  });

  assert.equal(result.plan.reviewPendingCount, 0);
});

test('이수 완료와 수강 중 과목의 학점이 구분되어 반영된다', () => {
  const rawText = [
    '2026학년도 1학기',
    klasRow(
      'I020-2-1234-01',
      '진로탐색및설계',
      '전선',
      1,
      'P'
    ),
    '2026학년도 2학기',
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '전선',
      3,
      ''
    ),
  ].join('\n');

  const { plan, validation } = processKlasText(rawText);

  assert.deepEqual(plan.completedCourses, [
    {
      courseId: 'career-exploration-design',
      termId: '2026-1',
      earnedCredits: 1,
    },
  ]);

  assert.deepEqual(plan.inProgressCourses, [
    {
      courseId: 'discrete-mathematics',
      termId: '2026-2',
    },
  ]);

  assert.equal(validation.summary.earnedTotalCredits, 1);
  assert.equal(validation.summary.earnedMajorCredits, 1);
  assert.equal(validation.summary.inProgressCredits, 3);
  assert.equal(validation.summary.projectedTotalCredits, 4);
  assert.equal(validation.summary.projectedMajorCredits, 4);
  assert.equal(validation.summary.projectedMajorElectiveCredits, 4);

  const progress = buildDegreeProgress(
    validation,
    plan,
    curriculum
  );

  assert.equal(progress.totalCredits.earned, 1);
  assert.equal(progress.totalCredits.projected, 4);
  assert.equal(progress.majorCredits.earned, 1);
  assert.equal(progress.majorCredits.projected, 4);

  assert.equal(progress.majorCredits.currentMissing, 59);
  assert.equal(progress.majorCredits.projectedMissing, 56);
});

test('과거 기초교양선택으로 이수한 이산수학은 전공학점에 포함하지 않는다', () => {
  const rawText = [
    '2023학년도 2학기',
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '기선',
      3,
      'A0'
    ),
  ].join('\n');

  const result = processKlasText(rawText);
  const { plan, validation } = result;

  assert.deepEqual(result.parsed.warnings, []);
  assert.equal(result.rows[0].category, 'foundation_elective');
  assert.equal(result.matched.courses.length, 0);

  assert.deepEqual(plan.completedCourses, []);
  assert.deepEqual(plan.inProgressCourses, []);

  assert.equal(plan.otherEarnedCredits.foundation_elective, 3);
  assert.equal(plan.reviewPendingCount, 0);

  assert.equal(validation.summary.earnedTotalCredits, 3);
  assert.equal(validation.summary.earnedMajorCredits, 0);
  assert.equal(validation.summary.projectedMajorCredits, 0);
});

test('교양선택으로 기록된 이산수학도 전공학점으로 변경하지 않는다', () => {
  const rawText = [
    '2023학년도 2학기',
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '교선',
      3,
      'B+'
    ),
  ].join('\n');

  const { plan, validation } = processKlasText(rawText);

  assert.deepEqual(plan.completedCourses, []);
  assert.equal(plan.otherEarnedCredits.general_elective, 3);
  assert.equal(plan.reviewPendingCount, 0);

  assert.equal(validation.summary.earnedTotalCredits, 3);
  assert.equal(validation.summary.earnedMajorCredits, 0);
  assert.equal(validation.summary.projectedMajorCredits, 0);
});

test('교양 및 전공으로 중복된 이산수학 수강 기록은 확인 대상으로 남긴다', () => {
  const rawText = [
    '2023학년도 2학기',
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '기선',
      3,
      'A0'
    ),
    '2026학년도 2학기',
    klasRow(
      'I000-2-1186-02',
      '이산수학',
      '전선',
      3,
      ''
    ),
  ].join('\n');

  const { plan, validation, historyIssues } =
    processKlasText(rawText);

  assert.equal(plan.reviewPendingCount, 2);

  assert.ok(
    historyIssues.some(
      (issue) => issue.reason === 'POSSIBLE_SAME_COURSE'
    )
  );

  assert.deepEqual(plan.completedCourses, []);
  assert.deepEqual(plan.inProgressCourses, []);
  assert.equal(plan.otherEarnedCredits.foundation_elective, 0);

  assert.equal(validation.summary.earnedTotalCredits, 0);
  assert.equal(validation.summary.projectedTotalCredits, 0);
  assert.equal(validation.summary.projectedMajorCredits, 0);
  assert.equal(validation.checks.inputReview.status, 'unknown');
});

test('이산수학 F 및 진로탐색및설계 NP 기록은 학점에 포함하지 않는다', () => {
  const rawText = [
    '2026학년도 1학기',
    klasRow(
      'I020-2-1234-01',
      '진로탐색및설계',
      '전선',
      1,
      'NP'
    ),
    klasRow(
      'I000-2-1186-01',
      '이산수학',
      '전선',
      3,
      'F'
    ),
  ].join('\n');

  const { rows, plan, validation } =
    processKlasText(rawText);

  assert.equal(rows[0].completionStatus, 'failed');
  assert.equal(rows[1].completionStatus, 'failed');

  assert.deepEqual(plan.completedCourses, []);
  assert.deepEqual(plan.inProgressCourses, []);

  assert.equal(validation.summary.earnedTotalCredits, 0);
  assert.equal(validation.summary.earnedMajorCredits, 0);
  assert.equal(validation.summary.projectedMajorCredits, 0);
  assert.equal(plan.reviewPendingCount, 0);
});
