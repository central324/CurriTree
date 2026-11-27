import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCreditProgress,
  buildDegreeProgress,
} from '../public/maker/degree-progress.js';

import {
  renderDegreeProgressView,
} from '../public/maker/degree-progress-view.js';

import { createEmptyPlan } from '../shared/maker/plan.js';
import { validatePlan } from '../shared/maker/validation.js';
import { loadRealCurriculum } from './helpers/curriculum.js';

const ELEMENT_IDS = [
  'maker-degree-progress-notice',
  'maker-degree-progress-content',
  'maker-degree-progress-credits',
  'maker-degree-required-summary',
  'maker-degree-required-counts',
  'maker-degree-required-list',
];

// 브라우저 DOM에서 이번 기능이 사용하는 부분만 재현합니다.
class TestElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.className = '';
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.text = '';
  }

  set textContent(value) {
    this.text = String(value);
    this.children = [];
  }

  get textContent() {
    return this.text +
      this.children.map(child => child.textContent).join('');
  }

  append(...elements) {
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    this.text = '';
    this.children = [...elements];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function withTestDocument(callback) {
  const previousDocument = globalThis.document;
  const elements = new Map(
    ELEMENT_IDS.map(id => [id, new TestElement()])
  );

  globalThis.document = {
    createElement(tagName) {
      return new TestElement(tagName);
    },
    getElementById(id) {
      assert.ok(elements.has(id), `존재하지 않는 요소: ${id}`);
      return elements.get(id);
    },
  };

  try {
    callback(id => elements.get(id));
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
}

function createProgress(plan, curriculum) {
  const result = validatePlan(plan, curriculum);
  return buildDegreeProgress(result, plan, curriculum);
}

function makeCheck(earned, projected, required) {
  return {
    earned,
    projected,
    required,
    missing: required === null
      ? null
      : Math.max(0, required - projected),
  };
}

test('검증 전에는 진행률과 과목 목록을 표시하지 않는다', () => {
  withTestDocument(get => {
    renderDegreeProgressView(null);

    assert.equal(
      get('maker-degree-progress-content').hidden,
      true
    );

    assert.equal(
      get('maker-degree-progress-notice').hidden,
      false
    );

    assert.match(
      get('maker-degree-progress-notice').textContent,
      /이수요건을 검증하면/
    );

    assert.equal(
      get('maker-degree-progress-credits').children.length,
      0
    );
  });
});

test('실제 교육과정의 총학점과 전공학점 진행률을 표시한다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);
  const progress = createProgress(plan, curriculum);

  withTestDocument(get => {
    renderDegreeProgressView(progress);

    assert.equal(
      get('maker-degree-progress-content').hidden,
      false
    );

    assert.equal(
      get('maker-degree-progress-notice').hidden,
      true
    );

    const cards =
      get('maker-degree-progress-credits').children;

    assert.equal(cards.length, 2);

    assert.match(cards[0].textContent, /133학점/);
    assert.match(cards[1].textContent, /60학점/);

    const requiredList =
      get('maker-degree-required-list');

    assert.equal(
      requiredList.children.length,
      curriculum.requirements.requiredCourseIds.length
    );

    assert.match(
      get('maker-degree-required-summary').textContent,
      /0과목 이수 완료/
    );
  });
});

test('전공필수 과목의 완료·수강 중·예정 상태를 구분한다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);
  const ids = curriculum.requirements.requiredCourseIds;

  const completedCourse = curriculum.courses.find(
    course => course.id === ids[0]
  );

  plan.completedCourses.push({
    courseId: ids[0],
    termId: '2024-1',
    earnedCredits: completedCourse.credits,
  });

  plan.inProgressCourses.push({
    courseId: ids[1],
    termId: '2026-2',
  });

  plan.plannedTerms.push({
    termId: '2027-1',
    courseIds: [ids[2]],
  });

  const progress = createProgress(plan, curriculum);

  withTestDocument(get => {
    renderDegreeProgressView(progress);

    const counts =
      get('maker-degree-required-counts').children;

    const list =
      get('maker-degree-required-list').children;

    assert.equal(counts.length, 4);

    assert.deepEqual(
      counts.map(item => item.textContent),
      [
        '1이수 완료',
        '1수강 중',
        '1수강 예정',
        `${ids.length - 3}미배치`,
      ]
    );

    assert.match(list[0].textContent, /이수 완료/);
    assert.match(list[1].textContent, /수강 중/);
    assert.match(list[2].textContent, /수강 예정/);

    assert.match(
      list[0].textContent,
      new RegExp(completedCourse.name)
    );

    // 수강 중·예정 학점은 현재 취득 학점에 포함되지 않습니다.
    assert.equal(
      progress.totalCredits.earned,
      completedCourse.credits
    );

    assert.ok(
      progress.totalCredits.projected >
      progress.totalCredits.earned
    );
  });
});

test('이전 결과를 초기화하면 오래된 과목과 진행률이 사라진다', () => {
  const curriculum = loadRealCurriculum();
  const plan = createEmptyPlan(curriculum.curriculumId);
  const progress = createProgress(plan, curriculum);

  withTestDocument(get => {
    renderDegreeProgressView(progress);

    assert.equal(
      get('maker-degree-progress-content').hidden,
      false
    );

    renderDegreeProgressView(
      null,
      '입학년도 변경으로 이전 결과를 초기화했습니다.'
    );

    assert.equal(
      get('maker-degree-progress-content').hidden,
      true
    );

    assert.equal(
      get('maker-degree-progress-credits').children.length,
      0
    );

    assert.equal(
      get('maker-degree-required-counts').children.length,
      0
    );

    assert.equal(
      get('maker-degree-required-list').children.length,
      0
    );

    assert.match(
      get('maker-degree-progress-notice').textContent,
      /입학년도 변경/
    );
  });
});

test('미확인 학점 기준과 요구 학점 0을 안전하게 표시한다', () => {
  const progress = {
    totalCredits: buildCreditProgress(
      makeCheck(30, 40, null)
    ),
    majorCredits: buildCreditProgress(
      makeCheck(0, 0, 0)
    ),
    requiredCourses: {
      state: 'unknown',
      total: null,
      counts: null,
      courses: [],
    },
  };

  withTestDocument(get => {
    renderDegreeProgressView(progress);

    const cards =
      get('maker-degree-progress-credits').children;

    assert.match(cards[0].textContent, /확인 필요/);
    assert.match(
      cards[1].textContent,
      /별도의 최소 이수 학점/
    );

    // 기준이 없으면 임의의 진행률 막대를 만들지 않습니다.
    for (const card of cards) {
      assert.equal(
        card.children.some(
          child => child.className === 'maker-degree-credit-bar'
        ),
        false
      );
    }

    assert.match(
      get('maker-degree-required-summary').textContent,
      /확인할 수 없습니다/
    );
  });
});

test('초과 학점의 진행률 막대는 100%를 넘지 않는다', () => {
  const progress = {
    totalCredits: buildCreditProgress(
      makeCheck(140, 150, 133)
    ),
    majorCredits: buildCreditProgress(
      makeCheck(60, 70, 60)
    ),
    requiredCourses: {
      state: 'unknown',
      total: null,
      counts: null,
      courses: [],
    },
  };

  withTestDocument(get => {
    renderDegreeProgressView(progress);

    const cards =
      get('maker-degree-progress-credits').children;

    const bar = cards[0].children.find(
      child => child.className === 'maker-degree-credit-bar'
    );

    assert.ok(bar);
    assert.equal(bar.children[0].style.width, '100%');
    assert.equal(bar.children[1].style.width, '0%');

    // 실제 수치는 표시하되 막대만 최대 100%로 제한합니다.
    assert.match(cards[0].textContent, /140학점/);
    assert.match(cards[0].textContent, /150학점/);
  });
});

test('모든 검증 성공 경로에서 진행 현황 갱신을 호출한다', () => {
  const script = readFileSync(
    new URL('../public/maker/maker.js', import.meta.url),
    'utf8'
  );

  // 일반 검증 및 계획 수정 성공 경로 6곳
  const successCalls = script.match(
    /renderCreditSummary\(result\.summary, result\);/g
  ) ?? [];

  assert.equal(successCalls.length, 6);

  // KLAS 이수내역 가져오기 경로
  assert.match(
    script,
    /renderCreditSummary\(\s*importedValidation\?\.summary \?\? null,\s*importedValidation\s*\)/
  );

  // 교육과정·입학년도 변경 시 초기화 경로
  const resetCalls = script.match(
    /renderCreditSummary\(null\);/g
  ) ?? [];

  assert.ok(resetCalls.length >= 2);
});

test('검증 응답의 최신성 검사 이후 진행 현황을 갱신한다', () => {
  const script = readFileSync(
    new URL('../public/maker/maker.js', import.meta.url),
    'utf8'
  );

  const start = script.indexOf(
    'validateButton.addEventListener("click", async () => {'
  );

  const end = script.indexOf(
    'async function removeRecordedCourse',
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const handler = script.slice(start, end);

  const guardIndex = handler.indexOf(
    'if (!isCurrentMakerRequest(requestScope))'
  );

  const renderIndex = handler.indexOf(
    'renderCreditSummary(result.summary, result)'
  );

  assert.ok(guardIndex >= 0);
  assert.ok(renderIndex > guardIndex);

  assert.match(
    handler,
    /renderDegreeProgressView\(\s*null,\s*'이수요건을 검사하고 있습니다\.'/
  );

  assert.match(
    handler,
    /이수요건 검증에 실패했습니다\. 다시 시도해주세요\./
  );
});
