// 교육과정 파일 읽기와 학과·교육과정 목록 정리
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildStore, loadCurriculumStore } from '../server/curriculum/store.js';
import { makeCurriculum, makeCurriculumDir } from './helpers/curriculum.js';

test('실제 데이터 폴더를 오류 없이 읽는다', () => {
  const store = loadCurriculumStore(fileURLToPath(new URL('../data/curricula/', import.meta.url)));
  assert.deepEqual(store.errors, []);
  assert.deepEqual(
    store.departments.map((department) => department.id),
    ['ce'],
  );
});

const official = { title: '공식', url: 'https://example.com', verifiedAt: '2026-11-08' };

test('기본 교육과정은 실제 데이터 우선, 그다음 최신 기준 연도', () => {
  const store = buildStore([
    makeCurriculum({ curriculumId: 'test-demo-2027', catalogYear: 2027, isDemo: true }),
    makeCurriculum({ curriculumId: 'test-2025', catalogYear: 2025, isDemo: false, source: official }),
    makeCurriculum({ curriculumId: 'test-2026', catalogYear: 2026, isDemo: false, source: official }),
  ]);
  const [department] = store.departments;
  assert.equal(department.defaultCurriculumId, 'test-2026');
  assert.deepEqual(
    department.curricula.map((curriculum) => curriculum.id),
    ['test-2026', 'test-2025', 'test-demo-2027'],
  );
  // defaultCurriculumId는 반드시 curricula 안에 있어야 함 (계약 5.4)
  assert.ok(department.curricula.some((curriculum) => curriculum.id === department.defaultCurriculumId));
});

test('curricula 항목은 교육과정 JSON과 같은 값을 가진다', () => {
  const curriculum = makeCurriculum({ admissionYears: [2025, 2026] });
  const [department] = buildStore([curriculum]).departments;
  assert.deepEqual(department.curricula[0], {
    id: curriculum.curriculumId,
    catalogYear: curriculum.catalogYear,
    admissionYears: [2025, 2026],
    isDemo: curriculum.isDemo,
  });
});

test('다른 학과의 교육과정 ID로는 찾지 않는다', () => {
  const store = buildStore([
    makeCurriculum({ curriculumId: 'ce-2026', department: { id: 'ce', name: '컴정공' } }),
    makeCurriculum({ curriculumId: 'ee-2026', department: { id: 'ee', name: '전자공' } }),
  ]);
  assert.equal(store.findCurriculum('ce', 'ee-2026').curriculum, null);
  assert.equal(store.findCurriculum('ce', 'ce-2026').curriculum.curriculumId, 'ce-2026');
  assert.equal(store.findCurriculum('nope').department, null);
});

test('계약을 어긴 파일이 있으면 전체를 오류로 처리한다', () => {
  const fixture = makeCurriculumDir({
    'good.json': makeCurriculum({ curriculumId: 'good-2026' }),
    'bad.json': makeCurriculum({ curriculumId: 'bad-2026', tags: ['ai'] }),
    'broken.json': '{ not json',
  });
  try {
    const store = loadCurriculumStore(fixture.directory);
    assert.ok(store.errors.some((error) => error.file === 'bad.json'));
    assert.ok(store.errors.some((error) => error.file === 'broken.json'));
    assert.deepEqual(store.departments, []);
  } finally {
    fixture.cleanup();
  }
});

test('여러 파일에 같은 교육과정 ID가 있으면 오류', () => {
  const fixture = makeCurriculumDir({ 'a.json': makeCurriculum(), 'b.json': makeCurriculum() });
  try {
    assert.ok(loadCurriculumStore(fixture.directory).errors.some((error) => error.field === 'curriculumId'));
  } finally {
    fixture.cleanup();
  }
});
