# CurriTree 개발 및 실행 환경

CurriTree는 광운대학교 컴퓨터정보공학부의 이수내역 관리,
학기별 수강 계획 및 졸업요건 검증을 지원하는 웹 애플리케이션입니다.

## 1. 개발 환경

- Node.js 22 이상
- npm
- Git
- Docker (컨테이너 실행 시)
- VS Code 권장

## 2. 로컬 개발 서버 실행

프로젝트 루트에서 실행합니다.

```bash
npm ci
npm run dev
```

서버 주소: http://localhost:3000/

주요 화면:

- `/` : 메인 화면
- `/klas/` : KLAS 이수내역 입력
- `/maker/` : 커리메이커
- `/roadmap/` : 전공 로드맵
- `/api/health` : 서버 상태 확인

## 3. Gemini 환경변수

프로젝트 루트에 `.env` 파일을 준비합니다.

```dotenv
PORT=3000
GEMINI_API_KEY=YOUR_API_KEY
```

기존 `.env` 파일이 있다면 그대로 사용합니다.

`GEMINI_MODEL`은 필요한 경우 추가할 수 있습니다.

실제 API 키가 포함된 `.env`는 Git에 커밋하지 않습니다.

## 4. 자동 테스트

```bash
npm test
```

KLAS 파싱, Gemini 매칭, 교육과정 검증,
커리메이커 및 서버 API 관련 테스트를 실행합니다.

## 5. Docker 실행

이미지 빌드:

```bash
docker build -t curritree:local .
```

기본 실행:

```bash
docker run --rm --name curritree-local -p 3000:3000 curritree:local
```

Gemini 환경변수 포함 실행:

```bash
docker run --rm --name curritree-local -p 3000:3000 --env-file .env curritree:local
```

컨테이너는 기본적으로 비루트 사용자 `node`로 실행됩니다.

## 6. GitHub Actions CI

PR 생성 또는 main 브랜치에 변경 사항이 반영되면:

1. npm 의존성 설치
2. 전체 자동 테스트 실행
3. Docker 이미지 빌드
4. 컨테이너 실행
5. 주요 화면 및 Health API 스모크 테스트

순서로 검증합니다.

## 7. Render 공개 테스트 서버

주소: https://curritree.onrender.com/

배포는 main 브랜치를 기준으로 진행합니다.

필수 환경변수는 Render 대시보드에서 관리합니다.

- PORT
- GEMINI_API_KEY
- GEMINI_MODEL

공개 서버에서 Gemini API 추천 기능을 사용하려면
GEMINI_API_KEY가 정상 등록되어 있어야 합니다.

Gemini API 요청에는 기본적인 IP별 호출 횟수 제한이 적용됩니다.

## 8. 협업 및 보안

- 기능별 브랜치에서 작업합니다.
- PR 병합 전 팀원 1명 이상의 승인을 받습니다.
- API 키와 실제 학생 개인정보를 커밋하지 않습니다.
- 테스트에는 가상 KLAS 성적조회 데이터를 사용합니다.
- AI 추천은 참고용이며 최종 과목 매칭은 사용자가 확정합니다.
