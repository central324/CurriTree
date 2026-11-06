# 디자인 가이드

팀원 모두가 같은 모양의 화면을 만들기 위한 규칙입니다. 초기 버전이라 꼭 필요한 것만 정했습니다.

> **어디에 무엇이 있나요?**
>
> | 정하는 것 | 파일 |
> | --- | --- |
> | 코드 서식 (들여쓰기, 줄바꿈, 인코딩) | `.editorconfig`, `.prettierrc.json`, `.vscode/settings.json` |
> | 색 · 글꼴 · 간격 | `public/styles.css` 맨 위 **디자인 토큰** |
> | 상단바 · 사이드바 메뉴 | `public/layout.js`의 `MENU` 배열 |
> | 버튼 · 입력창 · 칩 · 배지 | `public/styles.css`의 **공통 컴포넌트** |
>
> `.editorconfig`는 편집기의 **코드 서식**만 맞춰 줍니다. 색이나 글꼴 같은 **디자인 규칙**은 CSS 토큰으로 관리합니다.

## 1. 편집기 설정 (처음 한 번)

1. VS Code에서 저장소를 열면 오른쪽 아래에 **권장 확장 설치** 알림이 뜹니다. 설치합니다.
   - EditorConfig for VS Code
   - Prettier - Code formatter
2. 이후 파일을 저장할 때마다 `.prettierrc.json` 규칙으로 자동 정리됩니다.
   - 들여쓰기 공백 2칸, 작은따옴표, 한 줄 최대 120자, 줄바꿈 LF

## 2. 색 — 토큰만 사용합니다

CSS에서 색을 쓸 때 `#1f4d3a` 같은 값을 직접 쓰지 말고 **항상 토큰**을 씁니다.
테마를 바꿀 때 `public/styles.css`의 `:root` 한 곳만 고치면 전체 화면이 바뀝니다.

```css
/* ✅ 좋음 */
.my-card { border: 1px solid var(--color-line); color: var(--color-ink); }

/* ❌ 나쁨 */
.my-card { border: 1px solid #d8d2c2; color: #1e2a23; }
```

| 토큰 | 용도 |
| --- | --- |
| `--color-bg` | 페이지 배경 |
| `--color-surface` | 카드, 입력창, 사이드바 배경 |
| `--color-ink` | 기본 글자 |
| `--color-ink-muted` | 설명, 보조 글자 |
| `--color-line` / `--color-line-soft` | 테두리 / 구분선·마우스 올림 배경 |
| `--color-accent` | 주 색: 기본 버튼, 선택된 탭, 제목 강조 |
| `--color-accent-hover` | 주 색 버튼에 마우스를 올렸을 때 |
| `--color-accent-soft` | 선택된 항목의 옅은 배경 |
| `--color-accent-ink` | 주 색 배경 위의 글자 |
| `--color-ok` / `--color-warn` / `--color-error` | 충족 / 주의 / 미충족·오류 |

주 색(`accent`)은 화면에서 **가장 중요한 것 하나**에만 씁니다. 버튼이 여러 개면 기본 버튼 하나만 `button--primary`로 합니다.

## 3. 글꼴 · 간격 · 모서리

- 글꼴: Pretendard 하나만 사용합니다 (`--font-sans`). 굵기는 400 / 600 / 700 / 800.
- 글자 크기: 본문 16px, 보조 13–14px, 소제목 17px, 페이지 제목 32px.
- 간격: `--space-1`(4px) ~ `--space-16`(64px)만 씁니다. 임의의 값(예: 13px, 27px)은 쓰지 않습니다.
- 모서리: 버튼·입력 `--radius-sm`(6px), 카드 `--radius-md`(10px).
- 그림자, 그라데이션, 애니메이션은 초기 버전에서는 쓰지 않습니다.
  - 예외: 사이드바 열고 닫기, 페이지 전환(View Transitions), 홈 화면 배경 이수표 애니메이션(`.roadmap`). 사용자가 "동작 줄이기"를 켜 두면(`prefers-reduced-motion`) 움직임 없이 바로 바뀌거나 완성된 모습으로 보입니다.

## 4. 공통 컴포넌트

새로 만들기 전에 아래 클래스를 먼저 씁니다. (정의: `public/styles.css`)

```html
<a class="button button--primary" href="/maker/">커리메이커 열기</a>
<button class="button">보조 동작</button>
<button class="button button--quiet">취소</button>

<label class="field">
  <span>학과</span>
  <select>...</select>
</label>

<div class="chips">
  <button class="chip" aria-pressed="true">전체</button>
  <button class="chip" aria-pressed="false">전필</button>
</div>

<span class="type type--required">전필</span>
<span class="type type--elective">전선</span>
```

## 5. 페이지 만들기

모든 페이지는 같은 틀을 씁니다. `public/<페이지>/index.html`로 만들면 주소는 `/<페이지>/`가 됩니다.

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>페이지 이름 | 커리트리</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/styles.css" />
    <link rel="stylesheet" href="/<페이지>/<페이지>.css" />
    <script type="module" src="/layout.js"></script>      <!-- 상단바 + 사이드바 -->
    <script type="module" src="/<페이지>/<페이지>.js"></script>
  </head>
  <body>
    <main>...</main>
  </body>
</html>
```

- 사이드바 메뉴에 추가하려면 `public/layout.js`의 `MENU`에 한 줄을 넣습니다. `href`가 없으면 "준비 중"으로 표시됩니다.
- HTML 안에 `<script>...</script>`나 `style="..."`를 직접 쓰지 않고 파일로 분리합니다. (나중에 보안 헤더를 켜면 인라인 코드는 동작하지 않습니다.)
- 계산 규칙은 화면 이벤트 코드와 분리해 순수 함수 파일로 만듭니다. (예: `public/<페이지>/lib/<규칙>.js`)

## 6. 이름 규칙

- CSS 클래스: `블록__요소--상태` 형식 (예: `sidebar__link`, `button--primary`, `term--current`).
- 페이지 전용 CSS는 그 페이지 폴더에 둡니다 (예: `public/<페이지>/<페이지>.css`).
- 화면 문구: 버튼은 동작을 그대로 씁니다 ("저장", "불러오기"). 오류 문구는 무엇이 잘못됐고 어떻게 고치는지 씁니다.

## 7. 색 조합 후보

팀 투표용 후보입니다. 테마를 바꾸려면 아래 블록을 `public/styles.css`의 `:root` 색 토큰 부분에 그대로 붙여 넣습니다.

### 후보 1. 아이보리 + 진한 녹색 (현재 적용)

현재 적용된 테마. 차분하고 종이 같은 느낌.

```css
:root {
  --color-bg: #faf7ee;
  --color-surface: #fffdf8;
  --color-ink: #1e2a23;
  --color-ink-muted: #5e6b62;
  --color-line: #d8d2c2;
  --color-line-soft: #ece7da;
  --color-accent: #1f4d3a;
  --color-accent-hover: #173b2c;
  --color-accent-soft: #e2ebe3;
  --color-accent-ink: #ffffff;
  --color-ok: #2e7d4f;
  --color-warn: #a86411;
  --color-error: #b3392e;
}
```

### 후보 2. 화이트 + 크림슨

광운대 상징색 계열. 학교 서비스라는 인상이 강함.

```css
:root {
  --color-bg: #f7f7f8;
  --color-surface: #ffffff;
  --color-ink: #1b1d23;
  --color-ink-muted: #5b6170;
  --color-line: #cfd3da;
  --color-line-soft: #e6e8ec;
  --color-accent: #8c1d40;
  --color-accent-hover: #6f1633;
  --color-accent-soft: #f4e6eb;
  --color-accent-ink: #ffffff;
  --color-ok: #2f7d5b;
  --color-warn: #b25e09;
  --color-error: #b3261e;
}
```

### 후보 3. 샌드 베이지 + 네이비

따뜻한 배경에 신뢰감 있는 남색. 문서·학사 느낌.

```css
:root {
  --color-bg: #f6f2ea;
  --color-surface: #fffdf9;
  --color-ink: #1c2333;
  --color-ink-muted: #5d6474;
  --color-line: #d9d2c4;
  --color-line-soft: #eae4d8;
  --color-accent: #1f3a68;
  --color-accent-hover: #172c50;
  --color-accent-soft: #e2e8f2;
  --color-accent-ink: #ffffff;
  --color-ok: #2e7d4f;
  --color-warn: #a86411;
  --color-error: #b3392e;
}
```

### 후보 4. 쿨 그레이 + 코발트 블루

가장 무난한 웹 서비스 톤. 정보가 많아도 깔끔함.

```css
:root {
  --color-bg: #f4f6f9;
  --color-surface: #ffffff;
  --color-ink: #172033;
  --color-ink-muted: #586176;
  --color-line: #d3d9e3;
  --color-line-soft: #e7ebf1;
  --color-accent: #2453c7;
  --color-accent-hover: #1b41a0;
  --color-accent-soft: #e3eafb;
  --color-accent-ink: #ffffff;
  --color-ok: #1f7a55;
  --color-warn: #a35f0d;
  --color-error: #c0392b;
}
```

### 후보 5. 다크 차콜 + 민트

어두운 화면. 밤에 오래 볼 때 편하지만 인쇄·캡처엔 불리.

```css
:root {
  --color-bg: #15181c;
  --color-surface: #1e2228;
  --color-ink: #e8ecef;
  --color-ink-muted: #9aa3ad;
  --color-line: #3a414b;
  --color-line-soft: #2a3038;
  --color-accent: #4fc3a1;
  --color-accent-hover: #6ad3b4;
  --color-accent-soft: #1f3a33;
  --color-accent-ink: #0e1a16;
  --color-ok: #5cc493;
  --color-warn: #f0a24a;
  --color-error: #f2857d;
}
```
