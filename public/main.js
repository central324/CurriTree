// 홈 예시 이수표: 다 그려지면 마우스 반응(확대, 연결 과목 강조)을 켭니다.
const roadmap = document.querySelector('.roadmap__svg');

if (roadmap) {
  const courses = [...roadmap.querySelectorAll('.roadmap__course')];
  const links = [...roadmap.querySelectorAll('.roadmap__link')];

  const finish = () => roadmap.classList.add('roadmap--done');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lastCourse = courses.at(-1);

  if (reduceMotion || !lastCourse) {
    finish();
  } else {
    lastCourse.addEventListener('animationend', finish, { once: true });
  }

  // 과목 ID → 선수 과목·후속 과목 목록
  const previous = new Map();
  const next = new Map();
  for (const link of links) {
    const { from, to } = link.dataset;
    next.set(from, [...(next.get(from) ?? []), to]);
    previous.set(to, [...(previous.get(to) ?? []), from]);
  }

  // 한 방향으로 끝까지 따라가며 만나는 과목 ID를 모읍니다.
  const walk = (startId, graph) => {
    const found = new Set();
    const stack = [startId];
    while (stack.length > 0) {
      for (const id of graph.get(stack.pop()) ?? []) {
        if (!found.has(id)) {
          found.add(id);
          stack.push(id);
        }
      }
    }
    return found;
  };

  const clearFocus = () => {
    roadmap.classList.remove('roadmap--focus');
    roadmap.querySelectorAll('.is-path, .is-hovered').forEach((element) => {
      element.classList.remove('is-path', 'is-hovered');
    });
  };

  const showPath = (course) => {
    const id = course.dataset.id;
    const before = walk(id, previous);
    const after = walk(id, next);
    const onPath = new Set([id, ...before, ...after]);

    roadmap.classList.add('roadmap--focus');
    course.classList.add('is-hovered');
    for (const other of courses) {
      other.classList.toggle('is-path', onPath.has(other.dataset.id));
    }
    // 선은 (선수 쪽 경로 안의 선) 또는 (후속 쪽 경로 안의 선)만 강조합니다.
    for (const link of links) {
      const { from, to } = link.dataset;
      const upstream = (before.has(from) || from === id) && (before.has(to) || to === id);
      const downstream = (after.has(from) || from === id) && (after.has(to) || to === id);
      link.classList.toggle('is-path', upstream || downstream);
    }
  };

  for (const course of courses) {
    course.addEventListener('pointerenter', () => {
      if (roadmap.classList.contains('roadmap--done')) showPath(course);
    });
    course.addEventListener('pointerleave', clearFocus);
  }
}

// 시작 화면 하단의 개발 서버 연결 상태 표시
const status = document.querySelector('.status');
const statusText = status?.querySelector('.status__text');

async function checkHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || body.status !== 'ok') {
      throw new Error(`Unexpected response: ${response.status}`);
    }
    status.dataset.status = 'ok';
    statusText.textContent = '개발 서버 연결됨';
  } catch {
    status.dataset.status = 'error';
    statusText.textContent = '개발 서버에 연결할 수 없습니다. 터미널에서 npm run dev 실행 여부를 확인하세요.';
  }
}

if (status && statusText) {
  checkHealth();
}
