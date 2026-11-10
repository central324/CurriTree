import { Router } from 'express';

import {
  suggestCourseMatches,
  LlmUnavailableError,
} from '../services/geminiMatcher.js';

const CURRICULUM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sendError(response, status, code, message) {
  return response.status(status).json({
    schemaVersion: 1,
    error: {
      code,
      message,
      details: [],
    },
  });
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function hasOnlyKeys(value, allowedKeys) {
  return Object.keys(value).every(
    (key) => allowedKeys.includes(key)
  );
}

function isValidMatchingRequest(body) {
  if (!isObject(body)) {
    return false;
  }

  if (
    !hasOnlyKeys(body, [
      'schemaVersion',
      'curriculumId',
      'unmatchedCourses',
    ])
  ) {
    return false;
  }

  if (body.schemaVersion !== 1) {
    return false;
  }

  if (
    typeof body.curriculumId !== 'string' ||
    !CURRICULUM_ID_PATTERN.test(body.curriculumId)
  ) {
    return false;
  }

  if (!Array.isArray(body.unmatchedCourses)) {
    return false;
  }

  const clientIds = new Set();

  for (const course of body.unmatchedCourses) {
    if (!isObject(course)) {
      return false;
    }

    if (!hasOnlyKeys(course, ['clientId', 'name'])) {
      return false;
    }

    if (
      typeof course.clientId !== 'string' ||
      !course.clientId.trim()
    ) {
      return false;
    }

    if (
      typeof course.name !== 'string' ||
      !course.name.trim() ||
      /[\r\n\t]/.test(course.name)
    ) {
      return false;
    }

    if (clientIds.has(course.clientId)) {
      return false;
    }

    clientIds.add(course.clientId);
  }

  return true;
}

export function createAiMatchRouter({
  findCurriculum,
  matchCourses = suggestCourseMatches,
}) {
  if (typeof findCurriculum !== 'function') {
    throw new TypeError(
      '교육과정 조회 함수가 필요합니다.'
    );
  }

  const router = Router();

  router.post('/match-courses', async (request, response) => {
    if (!isValidMatchingRequest(request.body)) {
      return sendError(
        response,
        400,
        'INVALID_REQUEST',
        '과목 매칭 요청 형식이 올바르지 않습니다.'
      );
    }

    const {
      curriculumId,
      unmatchedCourses,
    } = request.body;

    try {
      const curriculum = await findCurriculum(curriculumId);

      if (
        !curriculum ||
        curriculum.curriculumId !== curriculumId
      ) {
        return sendError(
          response,
          404,
          'CURRICULUM_NOT_FOUND',
          '요청한 교육과정을 찾을 수 없습니다.'
        );
      }

      const result = await matchCourses({
        unmatchedCourses,
        curriculum,
      });

      return response.status(200).json(result);
    } catch (error) {
      if (error instanceof LlmUnavailableError) {
        return sendError(
          response,
          503,
          'AI_UNAVAILABLE',
          'AI 과목 매칭 서비스를 사용할 수 없습니다.'
        );
      }

      return sendError(
        response,
        500,
        'INTERNAL_ERROR',
        '서버에서 요청을 처리하지 못했습니다.'
      );
    }
  });

  return router;
}