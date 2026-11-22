
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(
  new URL('../public/klas/index.html', import.meta.url),
  'utf8'
);

test('KLAS 입력 가이드가 접기/펼치기 구조로 제공된다', () => {
  assert.match(
    html,
    /<details class="klas__guide">/
  );

  assert.match(
    html,
    /<summary>KLAS 이수내역은 어떻게 가져오나요\?<\/summary>/
  );

  assert.match(
    html,
    /대학생활 → 학습결과 → 수강\/성적조회/
  );
});

test('KLAS 공식 사이트 링크가 안전하게 제공된다', () => {
  assert.match(
    html,
    /href="https:\/\/klas\.kw\.ac\.kr\/"/
  );

  assert.match(
    html,
    /rel="noopener noreferrer"/
  );
});
