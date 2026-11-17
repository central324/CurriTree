// 홈·공통 레이아웃 애니메이션 규칙 (PR #9 리뷰 후속)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SIDEBAR_SLIDE_MS, sidebarCloseDelay } from '../public/layout.js';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const homeHtml = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('동작 줄이기 설정이면 사이드바를 기다리지 않고 바로 숨긴다', () => {
  assert.equal(sidebarCloseDelay(true), 0);
  assert.equal(sidebarCloseDelay(false), SIDEBAR_SLIDE_MS);
});

test('사이드바 대기 시간은 CSS의 --sidebar-duration과 같다', () => {
  const match = css.match(/--sidebar-duration:\s*([\d.]+)s/);
  assert.ok(match, '--sidebar-duration을 찾지 못함');
  assert.equal(Math.round(Number(match[1]) * 1000), SIDEBAR_SLIDE_MS);
});

// 홈 배경 이수표: HTML에 쓰인 data-step·data-order 값마다 CSS 지연 규칙이 있어야 순서대로 그려진다.
for (const [attribute, variable, defaultValue] of [
  ['data-step', '--step-index', '1'],
  ['data-order', '--order-index', '0'],
]) {
  test(`홈 이수표의 모든 ${attribute} 값에 CSS 지연 규칙이 있다`, () => {
    const values = new Set([...homeHtml.matchAll(new RegExp(`${attribute}="(\\d+)"`, 'g'))].map((m) => m[1]));
    assert.ok(values.size > 0);
    for (const value of values) {
      if (value === defaultValue) continue; // 기본값은 규칙 없이 0번째 지연
      const rule = new RegExp(`\\.roadmap \\[${attribute}='${value}'\\]\\s*\\{\\s*${variable}:`);
      assert.match(css, rule, `${attribute}="${value}" 규칙 없음`);
    }
  });
}
