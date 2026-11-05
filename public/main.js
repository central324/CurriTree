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
