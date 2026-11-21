# CurriTree PR 검토 및 병합 규칙

## 1. Pull Request
- 모든 변경 사항은 작업 브랜치에서 PR로 제출한다.
- PR에는 작업 내용, 관련 이슈, 테스트 결과를 작성한다.

## 2. 코드 리뷰
- CodeRabbit이 PR을 한국어로 자동 리뷰한다.
- 지적 사항을 확인하고 필요한 수정 후 스레드를 해결한다.
- CodeRabbit 또는 팀원의 승인 1건 이상을 요구한다.
- 보안, 데이터 계약, 배포 및 Ruleset 변경은 팀원 검토를 권장한다.

## 3. CI
- GitHub Actions의 `test`가 통과해야 한다.
- `Docker build and smoke test`도 통과해야 한다.
- 테스트 실패 상태에서는 PR을 병합하지 않는다.

## 4. 병합
- 필수 승인 및 CI 검사를 모두 충족한 후 병합한다.
- 최종 병합 여부는 PR 작성자가 확인한다.
