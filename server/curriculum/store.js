/**
 * data/curricula/*.json 파일을 읽어 학과·교육과정 조회용으로 정리합니다.
 *
 * loadCurriculumStore(directory) →
 *   { departments, findCurriculum(departmentId, curriculumId?), errors }
 *
 * - 계약을 어긴 파일이 하나라도 있으면 errors에 담고, 조회 API는 500(INTERNAL_ERROR)을 돌려줍니다.
 *   (잘못된 데이터를 일부만 보여주지 않기 위함)
 * - 학과의 기본 교육과정: 실제 데이터(isDemo: false) 우선 → 기준 연도(catalogYear)가 최신인 것.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCurriculum } from '../../shared/curriculum/validate.js';

export function loadCurriculumStore(directory) {
  const errors = [];
  const curricula = [];

  let files = [];
  try {
    files = readdirSync(directory)
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch (error) {
    errors.push({ file: directory, field: '', reason: `교육과정 폴더를 읽을 수 없습니다: ${error.code ?? error.message}` });
  }

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    } catch (error) {
      errors.push({ file, field: '', reason: `JSON 형식 오류: ${error.message}` });
      continue;
    }
    const problems = validateCurriculum(data);
    if (problems.length > 0) {
      problems.forEach((problem) => errors.push({ file, ...problem }));
      continue;
    }
    curricula.push(data);
  }

  const seen = new Set();
  for (const curriculum of curricula) {
    if (seen.has(curriculum.curriculumId)) {
      errors.push({ file: '', field: 'curriculumId', reason: `여러 파일에 같은 교육과정 ID: ${curriculum.curriculumId}` });
    }
    seen.add(curriculum.curriculumId);
  }

  return buildStore(errors.length > 0 ? [] : curricula, errors);
}

export function buildStore(curricula, errors = []) {
  const byDepartment = new Map();
  for (const curriculum of curricula) {
    const { id } = curriculum.department;
    if (!byDepartment.has(id)) byDepartment.set(id, []);
    byDepartment.get(id).push(curriculum);
  }

  const departments = [...byDepartment.entries()]
    .map(([id, list]) => {
      const sorted = [...list].sort(
        (a, b) => Number(a.isDemo) - Number(b.isDemo) || b.catalogYear - a.catalogYear || a.curriculumId.localeCompare(b.curriculumId),
      );
      return {
        id,
        name: sorted[0].department.name,
        defaultCurriculumId: sorted[0].curriculumId,
        curricula: sorted.map((curriculum) => ({
          id: curriculum.curriculumId,
          catalogYear: curriculum.catalogYear,
          admissionYears: curriculum.admissionYears,
          isDemo: curriculum.isDemo,
        })),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  function findCurriculum(departmentId, curriculumId) {
    const department = departments.find((item) => item.id === departmentId);
    if (!department) return { department: null, curriculum: null };
    const wanted = curriculumId ?? department.defaultCurriculumId;
    // 다른 학과의 교육과정 ID는 찾지 않습니다(계약 5.5).
    const curriculum = byDepartment.get(departmentId).find((item) => item.curriculumId === wanted) ?? null;
    return { department, curriculum };
  }

  return { departments, findCurriculum, errors };
}
