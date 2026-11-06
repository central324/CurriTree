/**
 * 모든 페이지에 공통 상단바와 사이드바를 넣습니다.
 *
 * 사용법: 페이지 <head>에 아래 한 줄만 넣으면 됩니다.
 *   <script type="module" src="/layout.js"></script>
 *
 * 메뉴를 추가·변경할 때는 아래 MENU 배열만 고칩니다.
 *   - href가 있으면 링크, 없으면 '준비 중'으로 표시됩니다.
 *   - 현재 주소와 href가 같으면 자동으로 선택 표시가 됩니다.
 */
export const MENU = [
  { label: '커리메이커', href: '/maker/' },
  { label: '메뉴1' },
  { label: '메뉴2' },
];

const MENU_ICON = `
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`;

const CLOSE_ICON = `
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>`;

function menuItem(item) {
  if (!item.href) {
    return `<li><span class="sidebar__link sidebar__link--disabled">${item.label}<small>준비 중</small></span></li>`;
  }
  const current = item.href === window.location.pathname ? ' aria-current="page"' : '';
  return `<li><a class="sidebar__link" href="${item.href}"${current}>${item.label}</a></li>`;
}

function renderLayout() {
  document.body.insertAdjacentHTML(
    'afterbegin',
    `
    <header class="topbar">
      <button type="button" class="menu-button" id="menu-open" aria-label="메뉴 열기"
              aria-expanded="false" aria-controls="sidebar">${MENU_ICON}</button>
      <a class="topbar__brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24" />커리트리</a>
    </header>
    <div class="sidebar-backdrop" id="sidebar-backdrop" hidden></div>
    <nav class="sidebar" id="sidebar" aria-label="주요 메뉴" hidden>
      <div class="sidebar__head">
        <a class="topbar__brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24" />커리트리</a>
        <button type="button" class="menu-button" id="menu-close" aria-label="메뉴 닫기">${CLOSE_ICON}</button>
      </div>
      <ul class="sidebar__list">${MENU.map(menuItem).join('')}</ul>
    </nav>`,
  );

  const openButton = document.getElementById('menu-open');
  const closeButton = document.getElementById('menu-close');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  // 열기: hidden을 풀고 → 다음 그림에서 is-open을 붙여 미끄러져 들어오게 합니다.
  // 닫기: is-open을 떼서 미끄러져 나가게 한 뒤 → 움직임이 끝나면 hidden을 다시 붙입니다.
  const SLIDE_MS = 280; // styles.css의 --sidebar-duration과 같은 값
  let isOpen = false;
  let hideTimer;

  function setOpen(open) {
    isOpen = open;
    clearTimeout(hideTimer);
    openButton.setAttribute('aria-expanded', String(open));

    if (open) {
      sidebar.hidden = false;
      backdrop.hidden = false;
      void sidebar.offsetWidth; // 브라우저가 닫힌 위치를 먼저 그리게 해서 열림 애니메이션이 보이도록 함
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
      closeButton.focus();
    } else {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      hideTimer = setTimeout(() => {
        if (!isOpen) {
          sidebar.hidden = true;
          backdrop.hidden = true;
        }
      }, SLIDE_MS);
      openButton.focus();
    }
  }

  openButton.addEventListener('click', () => setOpen(true));
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) setOpen(false);
  });
}

renderLayout();
