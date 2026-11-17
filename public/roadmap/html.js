// 화면 문자열 도우미 (화면과 분리된 순수 함수)
//
// 교육과정 데이터(과목명·id 등)를 innerHTML 템플릿에 넣기 전에 HTML 특수문자를 바꿔,
// 데이터에 꺾쇠·따옴표가 들어 있어도 태그나 속성으로 해석되지 않게 합니다.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

// 개설 학기 표시: null(아직 확인 못 함)이거나 비어 있으면 '확인 필요'
export function formatOfferedTerms(offeredTerms, labels = {}) {
  if (!Array.isArray(offeredTerms) || offeredTerms.length === 0) return '확인 필요';
  return offeredTerms.map((term) => labels[term] ?? term).join(', ');
}
