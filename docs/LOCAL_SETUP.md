# 로컬 개발 환경 설정

이 문서는 CurriTree의 **초기 실행용 뼈대**를 다룹니다. 아직 실제 전공 로드맵·수강 계획·졸업요건 검증 기능은 구현되지 않았습니다.

## 준비물

- Node.js 22 이상 (npm 포함)
- Git
- 코드 편집기 (VS Code 권장)

## 처음 실행하기

프로젝트 루트(`package.json`이 있는 폴더)에서 실행합니다.

```bash
npm ci
npm run dev
```

브라우저에서 다음 주소를 확인합니다.

- [http://localhost:3000](http://localhost:3000): 임시 시작 화면
- [http://localhost:3000/api/health](http://localhost:3000/api/health): 서버 상태 JSON

개발 서버를 종료하려면 터미널에서 `Ctrl+C`를 누릅니다.

## 테스트

```bash
npm test
```

현재는 시작 화면과 `/api/health` 엔드포인트에 대한 스모크 테스트를 실행합니다. 새 기능을 구현하면 해당 담당자가 정상·오류·경계값 테스트를 추가합니다.

## 명령어

| 명령어 | 용도 |
| --- | --- |
| `npm ci` | `package-lock.json`에 기록된 의존성 설치 |
| `npm run dev` | 파일 변경 감지 기능이 있는 개발 서버 실행 |
| `npm start` | 일반 서버 실행 |
| `npm test` | Node.js 내장 테스트 러너 실행 |

## 환경변수

`.env.example`에는 필요한 변수 이름만 기록합니다. API 키가 들어 있는 `.env`는 Git에 올리지 않습니다.

현재 `PORT`를 설정하지 않으면 `3000`번 포트로 실행됩니다. 예를 들어 PowerShell에서 실행 전에 다음을 입력할 수 있습니다.

```powershell
$env:PORT = '3100'
npm run dev
```

추후 LLM 연동과 수강 계획 영속 저장 기능이 추가되면 필요한 환경변수와 데이터 보존 방법을 이 문서에 기록합니다.

## 팀 협업 전 확인 사항

1. `docs/CONTRACT_CHECKLIST.md`를 검토하여 JSON 필드와 API 응답을 합의합니다.
2. 기능별 Issue와 브랜치를 만들고 구현합니다.
3. 테스트 완료 후 PR을 제출합니다.
4. 작성자 외 팀원 1명 이상의 승인을 받고 `main`에 병합합니다.
