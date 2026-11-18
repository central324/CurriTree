import { rateLimit } from 'express-rate-limit';

export function createAiRateLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,

    standardHeaders: 'draft-7',
    legacyHeaders: false,

    handler: (_request, response) => {
      return response.status(429).json({
        schemaVersion: 1,
        error: {
          code: 'RATE_LIMITED',
          message: 'AI 추천 요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
          details: [],
        },
      });
    },
  });
}
