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

  function setOpen(open) {
    sidebar.hidden = !open;
    backdrop.hidden = !open;
    openButton.setAttribute('aria-expanded', String(open));
    (open ? closeButton : openButton).focus();
  }

  openButton.addEventListener('click', () => setOpen(true));
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !sidebar.hidden) setOpen(false);
  });
}

renderLayout();
