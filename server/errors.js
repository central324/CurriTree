// 공통 오류 응답(docs/CONTRACT_CHECKLIST.md 6절)
// { schemaVersion: 1, error: { code, message, details? } }
import { SCHEMA_VERSION } from '../shared/curriculum/schema.js';

export function sendError(response, status, code, message, details) {
  const error = { code, message };
  if (details && details.length > 0) error.details = details;
  response.status(status).json({ schemaVersion: SCHEMA_VERSION, error });
}
