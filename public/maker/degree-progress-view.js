const REQUIRED_STATUSES = [
  ['completed', '이수 완료'],
  ['inProgress', '수강 중'],
  ['planned', '수강 예정'],
  ['unplaced', '미배치'],
];

function createElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  return element;
}

// 총학점 또는 전공학점 진행률 카드
function createCreditCard(title, progress) {
  const card = createElement(
    'div',
    'maker-degree-credit-card'
  );

  card.append(createElement('h4', '', title));

  if (progress.state === 'unknown') {
    card.append(
      createElement(
        'p',
        'maker-degree-credit-detail',
        '공식 학점 기준 확인 필요'
      ),
      createElement(
        'p',
        'maker-degree-credit-detail',
        `현재 ${progress.earned}학점 · ` +
        `계획 반영 ${progress.projected}학점`
      )
    );

    return card;
  }

  if (progress.state === 'no-requirement') {
    card.append(
      createElement(
        'p',
        'maker-degree-credit-detail',
        '별도의 최소 이수 학점이 설정되지 않았습니다.'
      ),
      createElement(
        'p',
        'maker-degree-credit-detail',
        `현재 ${progress.earned}학점 · ` +
        `계획 반영 ${progress.projected}학점`
      )
    );

    return card;
  }

  const numbers = createElement(
    'div',
    'maker-degree-credit-numbers'
  );

  numbers.append(
    createElement(
      'strong',
      '',
      `${progress.earned}학점`
    ),
    createElement(
      'span',
      '',
      `/ 기준 ${progress.required}학점`
    )
  );

  card.append(numbers);

  // 취득 완료 + 수강 중·예정 학점을 분리해 표시합니다.
  const bar = createElement(
    'div',
    'maker-degree-credit-bar'
  );

  bar.setAttribute('role', 'img');
  bar.setAttribute(
    'aria-label',
    `${title}: 현재 ${progress.currentPercent}%, ` +
    `계획 반영 ${progress.projectedPercent}%`
  );

  const earned = createElement(
    'div',
    'maker-degree-credit-bar-earned'
  );

  earned.style.width = `${progress.currentPercent}%`;

  const future = createElement(
    'div',
    'maker-degree-credit-bar-future'
  );

  // 완료 학점과 예상 학점의 차이만 추가 영역으로 표시합니다.
  const futurePercent = Math.max(
    0,
    progress.projectedPercent - progress.currentPercent
  );

  future.style.width = `${futurePercent}%`;

  bar.append(earned, future);
  card.append(bar);

  card.append(
    createElement(
      'p',
      'maker-degree-credit-detail',
      `현재 ${progress.currentPercent}% · ` +
      `계획 반영 ${progress.projectedPercent}%`
    ),
    createElement(
      'p',
      'maker-degree-credit-detail',
      `현재 부족 ${progress.currentMissing}학점 · ` +
      `계획 반영 후 부족 ${progress.projectedMissing}학점`
    ),
    createElement(
      'p',
      'maker-degree-credit-detail',
      `계획 반영 예상 ${progress.projected}학점`
    )
  );

  return card;
}

// 전공필수 이수 상태 표시
function renderRequiredCourses(
  progress,
  summary,
  counts,
  list
) {
  if (progress.state === 'unknown') {
    summary.textContent =
      '공식 전공필수 과목 기준을 확인할 수 없습니다.';
    return;
  }

  summary.textContent =
    `전체 ${progress.total}과목 중 ` +
    `${progress.counts.completed}과목 이수 완료`;

  for (const [status, label] of REQUIRED_STATUSES) {
    const card = createElement(
      'div',
      'maker-degree-required-count'
    );

    card.append(
      createElement(
        'strong',
        '',
        progress.counts[status]
      ),
      createElement('span', '', label)
    );

    counts.append(card);
  }

  for (const course of progress.courses) {
    const item = createElement(
      'li',
      'maker-degree-required-item'
    );

    const label =
      REQUIRED_STATUSES.find(
        ([status]) => status === course.status
      )?.[1] ?? '확인 필요';

    item.append(
      createElement('strong', '', course.name),
      createElement(
        'span',
        'maker-degree-required-status',
        label
      )
    );

    list.append(item);
  }
}

// 진행 현황을 표시하거나 초기화합니다.
export function renderDegreeProgressView(
  progress,
  message = '이수요건을 검증하면 진행 현황을 확인할 수 있습니다.'
) {
  const notice = document.getElementById(
    'maker-degree-progress-notice'
  );

  const content = document.getElementById(
    'maker-degree-progress-content'
  );

  const credits = document.getElementById(
    'maker-degree-progress-credits'
  );

  const summary = document.getElementById(
    'maker-degree-required-summary'
  );

  const counts = document.getElementById(
    'maker-degree-required-counts'
  );

  const list = document.getElementById(
    'maker-degree-required-list'
  );

  // 이전 교육과정이나 수강 계획의 표시를 제거합니다.
  credits.replaceChildren();
  counts.replaceChildren();
  list.replaceChildren();
  summary.textContent = '';

  content.hidden = true;
  notice.hidden = false;
  notice.textContent = message;

  if (!progress) {
    return;
  }

  credits.append(
    createCreditCard(
      '총 졸업학점',
      progress.totalCredits
    ),
    createCreditCard(
      '전공 최소 학점',
      progress.majorCredits
    )
  );

  renderRequiredCourses(
    progress.requiredCourses,
    summary,
    counts,
    list
  );

  notice.hidden = true;
  content.hidden = false;
}
