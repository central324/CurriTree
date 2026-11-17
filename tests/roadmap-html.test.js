// 로드맵 화면 문자열 도우미 (public/roadmap/html.js)
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { escapeHtml, formatOfferedTerms } from '../public/roadmap/html.js';

describe('escapeHtml', () => {
  test('HTML 특수문자를 모두 바꾼다', () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="a('b')">&`),
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  test('일반 과목명은 그대로 둔다', () => {
    assert.equal(escapeHtml('자료구조'), '자료구조');
  });

  test('숫자·null도 문자열로 다룬다', () => {
    assert.equal(escapeHtml(3), '3');
    assert.equal(escapeHtml(null), '');
  });
});

describe('formatOfferedTerms', () => {
  const labels = { 1: '1학기', 2: '2학기' };

  test('null(미확인)이면 확인 필요로 표시하고 오류가 나지 않는다', () => {
    assert.equal(formatOfferedTerms(null, labels), '확인 필요');
  });

  test('학기 값을 이름으로 바꿔 이어 붙인다', () => {
    assert.equal(formatOfferedTerms(['1', '2'], labels), '1학기, 2학기');
  });

  test('비어 있으면 확인 필요로 표시한다', () => {
    assert.equal(formatOfferedTerms([], labels), '확인 필요');
  });
});
