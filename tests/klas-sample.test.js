import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SAMPLE_CURRENT_TERM,
  SAMPLE_KLAS_TEXT,
} from '../public/klas/sample-data.js';

import { parseKlasText } from '../public/klas/parser.js';
import { matchParsedCourses } from '../public/klas/matcher.js';
import { loadRealCurriculum } from './helpers/curriculum.js';

test('예시 KLAS 데이터가 정상적으로 파싱된다', () => {
  const result = parseKlasText(SAMPLE_KLAS_TEXT, {
    currentTermId: SAMPLE_CURRENT_TERM,
  });

  assert.equal(result.courses.length, 6);
  assert.deepEqual(result.warnings, []);

  assert.equal(
    result.courses.filter(
      (course) => course.completionStatus === 'completed'
    ).length,
    4
  );

  assert.equal(
    result.courses.filter(
      (course) => course.completionStatus === 'in_progress'
    ).length,
    2
  );

  assert.deepEqual(
    result.courses.slice(-2).map((course) => course.termId),
    ['2026-2', '2026-2']
  );
});

test('예시 전공 과목이 실제 교육과정과 매칭된다', () => {
  const parsed = parseKlasText(SAMPLE_KLAS_TEXT, {
    currentTermId: SAMPLE_CURRENT_TERM,
  });

  const majorCourses = parsed.courses.filter(
    (course) =>
      course.category === 'major_required' ||
      course.category === 'major_elective'
  );

  const result = matchParsedCourses(
    majorCourses,
    loadRealCurriculum()
  );

  assert.equal(majorCourses.length, 5);
  assert.equal(result.reviewIssues.length, 0);

  assert.ok(
    result.courses.every(
      (course) => course.match.status === 'exact'
    )
  );
});

test('예시 입력 버튼과 클릭 이벤트가 연결되어 있다', () => {
  const html = readFileSync(
    new URL('../public/klas/index.html', import.meta.url),
    'utf8'
  );

  const script = readFileSync(
    new URL('../public/klas/klas.js', import.meta.url),
    'utf8'
  );

  assert.match(html, /id="sample-button"/);

  assert.match(
    script,
    /sampleButton\.addEventListener\('click', fillSampleInput\)/
  );

  assert.match(
    script,
    /currentTermInput\.value = SAMPLE_CURRENT_TERM/
  );
});
