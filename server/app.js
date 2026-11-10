import express from 'express';
import { fileURLToPath } from 'node:url';
import { CURRICULUM_ID_PATTERN, DEPARTMENT_ID_PATTERN } from '../shared/curriculum/schema.js';
import { loadCurriculumStore } from './curriculum/store.js';
import { sendError } from './errors.js';
import { createAiMatchRouter } from './routes/ai.js';

const defaultCurriculumDir = fileURLToPath(new URL('../data/curricula/', import.meta.url));
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));

/**
 * Express 앱을 만듭니다.
 * - curriculumDir: 교육과정 JSON 폴더 (테스트에서는 임시 폴더를 넘깁니다)
 * - logger: 교육과정 데이터 오류를 알릴 곳 (기본 console)
 */
export function createApp({ curriculumDir = defaultCurriculumDir, logger = console } = {}) {
  const app = express();
  const store = loadCurriculumStore(curriculumDir);

  if (store.errors.length > 0) {
    logger.error(`[curriculum] 교육과정 데이터 오류 ${store.errors.length}건 — 조회 API가 500을 반환합니다.`);
    store.errors.forEach(({ file, field, reason }) => logger.error(`  - ${file} ${field}: ${reason}`));
  }

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // A minimal endpoint to verify that the server runs.
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', service: 'CurriTree' });
  });

  // 학과 목록과 학과별 교육과정 목록 (계약 5.4)
  app.get('/api/departments', (_request, response) => {
    if (store.errors.length > 0) {
      return sendError(response, 500, 'INTERNAL_ERROR', '교육과정 데이터를 불러오지 못했습니다.');
    }
    response.json({ schemaVersion: 1, departments: store.departments });
  });

  // 학과의 교육과정 JSON (계약 5.5) — ?curriculumId=로 고르고, 없으면 기본 교육과정
  app.get('/api/curriculum/:dept', (request, response) => {
    const { dept } = request.params;
    const { curriculumId } = request.query;

    if (!DEPARTMENT_ID_PATTERN.test(dept)) {
      return sendError(response, 400, 'INVALID_REQUEST', '학과 ID 형식이 올바르지 않습니다.', [
        { field: 'dept', reason: '소문자 영문으로 시작하고 소문자 영문·숫자·하이픈만 사용' },
      ]);
    }
    if (curriculumId !== undefined && (typeof curriculumId !== 'string' || !CURRICULUM_ID_PATTERN.test(curriculumId))) {
      return sendError(response, 400, 'INVALID_REQUEST', '교육과정 ID 형식이 올바르지 않습니다.', [
        { field: 'curriculumId', reason: '소문자 영문·숫자와 하이픈만 사용' },
      ]);
    }
    if (store.errors.length > 0) {
      return sendError(response, 500, 'INTERNAL_ERROR', '교육과정 데이터를 불러오지 못했습니다.');
    }

    const { department, curriculum } = store.findCurriculum(dept, curriculumId);
    if (!department) {
      return sendError(response, 404, 'DEPARTMENT_NOT_FOUND', '등록되지 않은 학과입니다.');
    }
    if (!curriculum) {
      return sendError(response, 404, 'CURRICULUM_NOT_FOUND', '해당 학과에 등록되지 않은 교육과정입니다.');
    }
    response.json(curriculum);
  });
    // Gemini를 이용한 KLAS 과목 매칭 API
  // 기존 교육과정 저장소를 사용하여 요청된 교육과정을 조회합니다.
  app.use('/api/ai', createAiMatchRouter({
    findCurriculum: (curriculumId) => {
      // 교육과정 데이터에 오류가 있다면 정상적인 매칭을 진행하지 않습니다.
      if (store.errors.length > 0) {
        throw new Error('교육과정 데이터가 유효하지 않습니다.');
      }

      // 등록된 학과를 순회하며 curriculumId에 해당하는 교육과정을 찾습니다.
      for (const department of store.departments) {
        const { curriculum } = store.findCurriculum(
          department.id,
          curriculumId
        );

        if (curriculum) {
          return curriculum;
        }
      }

      // 요청한 교육과정이 존재하지 않는 경우
      return null;
    },
  }));
  // The actual planner screens will replace the temporary start page.
  app.use(express.static(publicDirectory));

  // 잘못된 JSON 본문 등 예상하지 못한 오류도 공통 오류 형식으로 응답합니다.
  app.use((error, _request, response, _next) => {
    if (error.type === 'entity.parse.failed') {
      return sendError(response, 400, 'INVALID_REQUEST', '요청 본문이 올바른 JSON이 아닙니다.');
    }
    logger.error(error);
    sendError(response, 500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
  });

  return app;
}

export const app = createApp();
