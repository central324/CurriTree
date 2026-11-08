# CurriTree API·데이터 계약 명세서

> **계약 버전: v1.0**
>
> 관련 Issue: #6
>
> 이 문서는 CurriTree의 프론트엔드, 백엔드 및 공통 계산 규칙에서 사용할 데이터 형식과 API 계약을 정의합니다.
>
> 팀원들은 이 문서를 기준으로 각자의 담당 기능을 구현합니다. 공통 필드명이나 API 응답 구조를 변경할 경우 관련 담당자와 협의하고 문서를 먼저 수정합니다.

## 1. 공통 설계 원칙

### 1.1 기본 규칙

| 항목 | 규칙 |
| --- | --- |
| 데이터 형식 | JSON |
| 스키마 버전 | `schemaVersion: 1` |
| 필드명 | 영어 camelCase |
| 과목 식별자 | 교육과정 과목 객체는 `courses[].id`, 다른 데이터에서 참조할 때는 `courseId` |
| 학과 식별자 | 학과 객체는 `department.id` 또는 `departments[].id`, 다른 데이터에서 참조할 때는 `departmentId` |
| 교육과정 식별자 | `curriculumId` |
| 실제 학기 | `YYYY-1`, `YYYY-2`, `YYYY-S`, `YYYY-W` |
| 권장 학기 | `1-1` ~ `4-2` |
| API 응답 | `application/json` |
| 계산 규칙 | 화면과 분리된 JavaScript 순수 함수 |
| 개인정보 | 원본 KLAS 텍스트 및 성적 원문 저장·전송 금지 |

### 1.2 과목 ID 규칙

과목은 과목명이 아니라 고유 ID를 기준으로 관리합니다.

**교육과정 원본의 과목 객체에서는 `id`를 사용하고, 수강 계획·매칭 결과 등 다른 데이터에서 해당 과목을 참조할 때는 `courseId`를 사용합니다.** 두 필드는 값이 동일해야 합니다. `courseId`는 별개의 새 식별자가 아니라 `courses[].id`의 참조 필드입니다.

예시:

```json
{
  "id": "demo-ds",
  "name": "자료구조"
}
```

예를 들어 수강 계획에서는 `{ "courseId": "demo-ds" }`로 위 과목을 참조합니다.

`courses[].id`는 해당 교육과정 내부에서 중복되지 않는 고유 값입니다.

과목명이 변경되더라도 동일한 과목으로 확인되면 기존 `id`를 유지하고, 과거 명칭은 `aliases`에 추가합니다.

학과 ID도 학과 객체 내부에서는 `id`를 사용하고, 이를 다른 객체에서 참조하는 필드가 필요할 때 `departmentId`를 사용합니다. 학과 ID 값은 소문자 영문으로 시작하며 이후 소문자 영문·숫자·하이픈을 허용합니다(예: `ce`).

KLAS 학정번호는 분반 정보가 포함될 수 있으므로 과목의 내부 ID와 동일하게 취급하지 않습니다.

예시:

```text
KLAS 학정번호: I020-2-3703-02
과목 식별 코드: I020-2-3703
```

KLAS 학정번호에서 분반 번호를 제거하는 규칙은 확인된 형식에만 적용하며, 특수한 학정번호는 임의로 변환하지 않습니다.

### 1.3 학기 표현 방식

실제 학기와 교육과정의 권장 학기를 구분합니다.

**실제 학기**

| 값 | 의미 |
| --- | --- |
| `2026-1` | 2026학년도 1학기 |
| `2026-S` | 2026학년도 하계 계절학기 |
| `2026-2` | 2026학년도 2학기 |
| `2026-W` | 2026학년도 동계 계절학기 |

학기 정렬 순서는 다음과 같습니다.

```text
1학기 → 하계 계절학기 → 2학기 → 동계 계절학기
```

**권장 학기**

| 값 | 의미 |
| --- | --- |
| `1-1` | 1학년 1학기 |
| `1-2` | 1학년 2학기 |
| `2-1` | 2학년 1학기 |
| `2-2` | 2학년 2학기 |
| `3-1` | 3학년 1학기 |
| `3-2` | 3학년 2학기 |
| `4-1` | 4학년 1학기 |
| `4-2` | 4학년 2학기 |

권장 학기는 실제 수강 이력을 의미하지 않습니다.

사용자의 실제 이수 여부는 KLAS 입력 결과 또는 사용자의 직접 확인을 통해 결정합니다.

---

## 2. 교육과정 JSON 계약

**담당: 이태희**

### 2.1 기본 구조

교육과정 데이터는 다음 항목을 포함합니다.

| 필드 | 자료형 | 설명 |
| --- | --- | --- |
| `schemaVersion` | number | 데이터 스키마 버전 |
| `curriculumId` | string | 교육과정 고유 ID |
| `department` | object | 학과 정보 |
| `catalogYear` | number | 교육과정 기준 연도 |
| `admissionYears` | number[] | 적용 입학년도 |
| `isDemo` | boolean | 예시 데이터 여부 |
| `source` | object | 공식 자료 출처 |
| `tags` | string[] | 사용 가능한 진로 태그 |
| `courses` | array | 과목 목록 |
| `requirements` | object | 이수요건 |

### 2.2 과목 데이터 필드

| 필드 | 자료형 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | string | O | 과목 고유 ID |
| `name` | string | O | 과목명 |
| `aliases` | string[] | O | 과거 명칭 및 별칭 |
| `courseCodes` | string[] | O | 학정번호에서 분반을 제외한 과목 코드 |
| `credits` | number | O | 학점 |
| `category` | string | O | 이수구분 |
| `recommendedTerm` | string/null | O | 권장 학년·학기 |
| `offeredTerms` | string[]/null | O | 확인된 개설 학기 |
| `hardPrerequisiteIds` | string[]/null | O | 공식 필수 선수 과목 관계 |
| `recommendedPreviousIds` | string[] | O | 권장 선행 과목 |
| `tags` | string[] | O | 진로 태그 |

`aliases`와 `courseCodes`는 필수 필드이지만 확인된 값이 없으면 `[]`을 허용합니다. 해당 필드를 생략하거나 `null`로 두지 않습니다. 비어 있는 `courseCodes`를 임의의 코드로 채우지 않고 과목명 기반 매칭 및 사용자 확인을 사용합니다.

`recommendedTerm`에는 `1-1`부터 `4-2`까지의 권장 학년·학기 문자열 또는 `null`만 사용합니다.

`offeredTerms`에는 교육과정에 표기된 정규·계절학기 구분을 다음 문자열로 저장합니다.

| 값 | 의미 |
| --- | --- |
| `"1"` | 1학기 |
| `"2"` | 2학기 |
| `"S"` | 하계 계절학기 |
| `"W"` | 동계 계절학기 |

- 예: `"offeredTerms": ["1", "2"]`
- `null`: 개설 학기 정보를 아직 확인하지 못함
- `[]`: 확인된 기준 교육과정 자료에 개설 학기가 표시되지 않음

`offeredTerms`는 `YYYY-1` 같은 실제 수강 학기(`termId`)가 아니라 **개설 학기 유형**을 뜻합니다. 미래 학기의 실제 개설 여부를 보장하지 않으므로 P0에서는 안내용으로 사용하고 수강 계획의 강제 차단 조건으로 사용하지 않습니다.

`hardPrerequisiteIds`와 `recommendedPreviousIds`는 반드시 구분합니다.

- `hardPrerequisiteIds`: 공식적으로 확인된 필수 선수 조건
- `recommendedPreviousIds`: 학습 순서를 안내하는 권장 관계

공식 선수 조건이 확인되지 않았다면 권장 관계를 임의로 필수 조건으로 변경하지 않습니다.

`hardPrerequisiteIds`는 다음 세 경우를 명확히 구분합니다.

- `null`: 해당 과목의 공식 필수 선수 조건을 아직 확인하지 못함
- `[]`: 공식 자료를 확인했으며 필수 선수 과목이 없음
- `["course-id"]`: 공식 자료에서 확인된 필수 선수 과목이 있음

`null`인 과목에 대해서는 선수 조건을 충족했다고 확정하지 않고, 검증 결과에 확인 필요(`unknown`)를 반영합니다. `recommendedPreviousIds`는 등록된 권장 선행 관계만 담으며, 해당 관계가 없으면 빈 배열 `[]`을 사용합니다.

### 2.3 이수구분 값

| KLAS 표기 | JSON 값 |
| --- | --- |
| 전필 | `major_required` |
| 전선 | `major_elective` |
| 교필 | `general_required` |
| 교선 | `general_elective` |
| 기필 | `foundation_required` |
| 기선 | `foundation_elective` |
| 일선 | `free_elective` |
| 확인 불가 | `unknown` |

프론트엔드에서는 JSON 값을 사용자에게 익숙한 한국어로 변환하여 표시합니다.

### 2.4 진로 태그

초기 진로 태그는 다음 네 가지로 정의합니다.

| 값 | 표시명 |
| --- | --- |
| `ai` | AI |
| `security` | 보안 |
| `backend` | 백엔드 |
| `systems` | 시스템 |

태그는 배열로 관리하며 과목 하나에 여러 태그를 지정할 수 있습니다.

### 2.5 교육과정 JSON 예시

> 아래 데이터는 구조 설명을 위한 가상 데이터입니다. 실제 광운대학교 교육과정이나 졸업요건이 아닙니다.

```json
{
  "schemaVersion": 1,
  "curriculumId": "ce-demo-2026",
  "department": {
    "id": "ce",
    "name": "컴퓨터정보공학부"
  },
  "catalogYear": 2026,
  "admissionYears": [2026],
  "isDemo": true,
  "source": {
    "title": "개발용 예시 데이터",
    "url": null,
    "verifiedAt": null
  },
  "tags": ["ai", "security", "backend", "systems"],
  "courses": [
    {
      "id": "demo-prog",
      "name": "프로그래밍기초",
      "aliases": ["C프로그래밍"],
      "courseCodes": ["DEMO-101"],
      "credits": 3,
      "category": "major_required",
      "recommendedTerm": "1-1",
      "offeredTerms": null,
      "hardPrerequisiteIds": [],
      "recommendedPreviousIds": [],
      "tags": ["backend"]
    },
    {
      "id": "demo-ds",
      "name": "자료구조",
      "aliases": ["데이터구조설계"],
      "courseCodes": ["DEMO-201"],
      "credits": 3,
      "category": "major_required",
      "recommendedTerm": "2-1",
      "offeredTerms": null,
      "hardPrerequisiteIds": ["demo-prog"],
      "recommendedPreviousIds": [],
      "tags": ["backend", "systems"]
    },
    {
      "id": "demo-ml",
      "name": "머신러닝",
      "aliases": ["기계학습"],
      "courseCodes": ["DEMO-301"],
      "credits": 3,
      "category": "major_elective",
      "recommendedTerm": "3-1",
      "offeredTerms": null,
      "hardPrerequisiteIds": ["demo-ds"],
      "recommendedPreviousIds": [],
      "tags": ["ai"]
    }
  ],
  "requirements": {
    "minimumTotalCredits": null,
    "minimumMajorCredits": 9,
    "minimumMajorElectiveCredits": 3,
    "requiredCourseIds": ["demo-prog", "demo-ds"],
    "maximumTermCredits": 6
  }
}
```

### 2.6 이수요건 데이터 규칙

이수요건은 다음 필드를 사용합니다.

| 필드 | 의미 |
| --- | --- |
| `minimumTotalCredits` | 총 이수 최소 학점 |
| `minimumMajorCredits` | 전공 최소 학점 |
| `minimumMajorElectiveCredits` | 전공선택 최소 학점 |
| `requiredCourseIds` | 반드시 이수해야 하는 과목 ID 목록 또는 `null` |
| `maximumTermCredits` | 학기별 최대 신청 학점 |

기준이 확인되지 않은 값은 `null`로 표시합니다.

- `null`: 기준 미확인
- `0`: 공식적으로 요구 학점이 0학점인 경우
- 양수: 확인된 기준 학점

`null`을 `0`으로 처리하거나 요건을 충족한 것으로 간주하지 않습니다.

`requiredCourseIds`도 다음과 같이 구분합니다.

- `null`: 필수 이수 과목 목록을 확인하지 못함
- `[]`: 공식적으로 확인했으며 필수 이수 과목이 없음
- `["course-id"]`: 반드시 이수해야 하는 과목이 있음

`requiredCourseIds: null`은 전공필수 과목 요건을 충족한 것으로 간주하지 않고 `unknown`으로 판정합니다. 배열에 포함된 ID는 해당 교육과정의 `courses`에 존재해야 합니다.

실제 교육과정 데이터를 등록할 때는 공식 자료 출처와 확인일을 기록해야 합니다.

`source.verifiedAt`은 `YYYY-MM-DD` 형식의 날짜 문자열 또는 `null`입니다(예: `"2026-11-08"`). 확인하지 않은 날짜를 임의로 기입하지 않습니다.

`isDemo: false`인 데이터는 확인 가능한 출처 URL이 있어야 합니다. 검증이 완료된 공식 데이터의 확인 날짜도 `source.verifiedAt`에 기록합니다.

`minimumMajorCredits`는 **전공필수(`major_required`) + 전공선택(`major_elective`)**의 합계에 적용합니다. `minimumMajorElectiveCredits`는 이 중 전공선택 학점만 별도로 검사하며, 같은 전공선택 학점이 두 기준에 모두 기여하는 것은 중복 취득으로 간주하지 않습니다.

교양·기초·일반선택 등의 유효한 취득 학점은 `minimumTotalCredits` 판정에 합산하지만, **교양 필수 과목·교양 영역별 최소 학점 등 별도의 교양 졸업요건 판정은 P0 범위에서 제외**합니다. 따라서 이 서비스의 `met`는 등록된 P0 요건에 대한 참고 판정이며 실제 졸업 확정을 의미하지 않습니다.

---

## 3. KLAS 수강 내역 데이터 계약

**담당: 박현수**

### 3.1 처리 위치

KLAS 원본 텍스트는 브라우저에서만 처리합니다.

```text
KLAS 텍스트 복사
    ↓
브라우저에서 텍스트 파싱
    ↓
과목·학점·이수 상태 추출
    ↓
교육과정 데이터와 매칭
    ↓
불명확한 과목만 LLM 매칭
    ↓
사용자 확인 및 수정
    ↓
커리큘럼 메이커 반영
```

서버에 KLAS 원본 텍스트나 성적 원문을 전달하는 API는 구현하지 않습니다.

### 3.2 파싱 데이터 필드

브라우저에서 추출한 한 과목의 데이터 구조는 다음과 같습니다.

| 필드 | 자료형 | 설명 |
| --- | --- | --- |
| `clientRowId` | string | 브라우저에서 생성한 임시 행 ID |
| `termId` | string | 실제 이수 학기 |
| `courseCode` | string/null | KLAS 학정번호 |
| `subjectCode` | string/null | 분반을 제외한 과목 코드 |
| `name` | string | 과목명 |
| `credits` | number/null | 학점 |
| `category` | string | 이수구분 |
| `completionStatus` | string | 이수 상태 |
| `match` | object | 교육과정 과목 매칭 결과 |

예시:

```json
{
  "clientRowId": "local-001",
  "termId": "2026-2",
  "courseCode": "I020-2-3703-02",
  "subjectCode": "I020-2-3703",
  "name": "데이터구조설계",
  "credits": 3,
  "category": "major_required",
  "completionStatus": "in_progress",
  "match": {
    "status": "unmatched",
    "courseId": null
  }
}
```

위 예시에서 성적이 입력되지 않은 과목은 `in_progress`로 분류합니다.

이 데이터는 브라우저에서 사용하는 중간 결과이며, 원문 전체를 서버에 전달하지 않습니다.

### 3.3 이수 상태

| 값 | 의미 | 취득 학점 반영 |
| --- | --- | --- |
| `completed` | 이수 완료 | O |
| `in_progress` | 수강 중 | X |
| `failed` | 미이수 | X |
| `deleted` | 재수강 등으로 성적 삭제 | X |
| `needs_review` | 판단 불가 | X |

수강 예정 과목에는 별도의 `planned` 상태를 사용합니다.

### 3.4 성적 처리 규칙

다음 **우선순위**로 이수 상태를 판정합니다. 먼저 해당되는 규칙을 적용한 뒤에는 하위 규칙을 적용하지 않습니다.

1. `삭제` 표시가 있는 성적: `deleted` (예: `D+(삭제)`)
2. F, NP 등 미이수 성적: `failed`
3. A+, A0, B+, B0, C+, C0, D+, D0 등 이수 인정 성적과 P: `completed`
4. 현재 진행 중인 학기의 성적 공란: `in_progress`
5. 지난 학기의 성적 공란 또는 판단할 수 없는 값: `needs_review`

성적 공란이라는 이유만으로 무조건 `in_progress`로 분류하지 않습니다. 현재 진행 중인 학기인지 확인할 수 없는 경우에도 `needs_review`로 처리합니다.

실제 학교의 학점 인정 규칙과 다른 예외가 확인되면 해당 규칙을 보완합니다.

### 3.5 재수강 처리

동일 과목을 여러 번 수강한 경우 다음 원칙을 적용합니다.

1. 과목의 수강 기록 자체는 구분하여 처리합니다.
2. 삭제된 성적은 취득 학점에 포함하지 않습니다.
3. F 등 미이수 성적은 취득 학점에 포함하지 않습니다.
4. 유효한 최종 이수 기록은 과목별로 한 번만 합산합니다.
5. 동일 과목 여부나 최종 인정 기록이 불명확하면 `needs_review`로 처리합니다.

### 3.6 과목 매칭 상태

| 값 | 의미 |
| --- | --- |
| `exact` | 학정번호·과목명·별칭 등의 규칙으로 명확히 일치 |
| `suggested` | LLM이 매칭 후보를 제시 |
| `unmatched` | 일치하는 과목을 찾지 못함 |
| `confirmed` | 사용자가 최종 확인 |

LLM이 반환한 `suggested` 상태는 이수 내역에 자동 반영하지 않습니다.

사용자가 최종 확인하면 `confirmed`로 변경합니다.

### 3.7 전공 외 과목 처리

교육과정 JSON에 존재하지 않는 교양·일반선택 과목도 처리합니다.

- 이수 완료가 확인된 전공 외 과목은 총 취득 학점에 반영합니다.
- 전공필수·전공선택 학점에는 합산하지 않습니다.
- 학점 및 이수구분이 불명확하면 `needs_review`로 처리합니다.
- 동일 과목의 재수강 및 삭제 기록은 중복 계산하지 않습니다.

전공 외 과목은 P0 단계에서 과목별 상세 정보 대신 이수구분별 인정 학점 합계로 서버에 전달할 수 있습니다.

### 3.8 개인정보 보호

다음 데이터는 서버나 외부 LLM에 전달하지 않습니다.

- KLAS 원본 텍스트
- 성적 원문
- 이름
- 학번
- 학점 평균
- 기타 개인 식별 정보

브라우저 저장소에도 KLAS 원문을 저장하지 않습니다.

LLM 요청에는 추출·정제된 과목명과 교육과정 매칭 후보만 포함합니다.

---

## 4. 수강 계획 데이터 계약

**담당: 조찬희**

### 4.1 기본 구조

수강 계획은 실제 이수 내역과 향후 수강 예정 과목을 분리합니다.

| 필드 | 설명 |
| --- | --- |
| `schemaVersion` | 계약 버전 |
| `curriculumId` | 적용 교육과정 |
| `completedCourses` | 이수 완료 과목 |
| `inProgressCourses` | 현재 수강 중인 과목 |
| `otherEarnedCredits` | 전공 외 취득 학점 |
| `plannedTerms` | 향후 학기별 수강 계획 |
| `reviewPendingCount` | 사용자 확인이 필요한 항목 수 |

**배열 내부 객체 형식**

| 배열 | 객체 필드 | 의미 |
| --- | --- | --- |
| `completedCourses` | `courseId`, `termId`, `earnedCredits` | 이수 완료한 과목, 이수 학기 및 실제 인정 학점 |
| `inProgressCourses` | `courseId`, `termId` | 현재 수강 중인 과목 및 수강 학기 |
| `plannedTerms` | `termId`, `courseIds` | 향후 학기와 배치한 과목 ID 목록 |

`inProgressCourses`의 과목 학점은 교육과정 JSON의 `courses[].credits`로 계산합니다. 아직 `courseId`가 확정되지 않은 과목은 해당 배열에 넣지 않고 사용자 확인 대상으로 남깁니다.

### 4.2 수강 계획 JSON 예시

```json
{
  "schemaVersion": 1,
  "curriculumId": "ce-demo-2026",
  "completedCourses": [
    {
      "courseId": "demo-prog",
      "termId": "2025-1",
      "earnedCredits": 3
    },
    {
      "courseId": "demo-ds",
      "termId": "2026-1",
      "earnedCredits": 3
    }
  ],
  "inProgressCourses": [],
  "otherEarnedCredits": {
    "general_required": 0,
    "general_elective": 3,
    "foundation_required": 0,
    "foundation_elective": 0,
    "free_elective": 0
  },
  "plannedTerms": [
    {
      "termId": "2027-1",
      "courseIds": ["demo-ml"]
    }
  ],
  "reviewPendingCount": 0
}
```

위 예시는 2번 항목의 개발용 교육과정 데이터와 함께 사용합니다.

`inProgressCourses`에 실제 수강 중인 과목이 있는 경우의 **별도 형식 예시**는 다음과 같습니다. 위 전체 계획 JSON의 학기 배치와 합쳐서 사용하는 예시는 아닙니다.

```json
{
  "inProgressCourses": [
    {
      "courseId": "demo-ml",
      "termId": "2026-2"
    }
  ]
}
```

### 4.3 계산 기준

- `completedCourses`: 현재 취득한 학점에 포함
- `inProgressCourses`: 현재 취득한 학점에는 포함하지 않고, 교육과정 학점 기준으로 예상 학점에 포함
- `plannedTerms`: 계획상 취득 예정 학점에 포함
- `otherEarnedCredits`: 전공 외 취득 학점으로 합산
- `reviewPendingCount`: 확인되지 않은 항목 수

현재 취득 학점과 향후 계획을 모두 이행했을 때의 예상 학점은 별도로 계산합니다. 예상 학점은 `현재 취득 학점 + 수강 중 과목 학점 + 향후 계획 과목 학점`으로 계산합니다.

`reviewPendingCount`가 0보다 크면 다른 요건을 모두 충족하더라도 전체 결과를 `met`로 확정하지 않습니다.

프론트엔드는 아직 사용자 확인이 끝나지 않은 과목·학점·재수강 항목의 수를 기준으로 `reviewPendingCount`를 계산합니다. 미확인 과목을 `completedCourses`, `inProgressCourses`, `plannedTerms`에 임의로 포함하지 않습니다.

### 4.4 중복 처리

- 동일 과목 ID를 여러 계획 학기에 배치할 수 없습니다.
- 동일 과목을 취득 학점에 중복 합산할 수 없습니다.
- P0에서는 이수 완료 과목을 향후 수강 계획에 다시 배치하는 재수강 계획을 지원하지 않습니다.
- 동일 `courseId`가 `completedCourses`와 `plannedTerms`에 동시에 있으면 `/api/validate`에서 HTTP 422를 반환합니다.
- 동일 `courseId`가 `completedCourses`와 `inProgressCourses`에 동시에 있어도 HTTP 422를 반환합니다.
- 동일 `courseId`가 `inProgressCourses`와 `plannedTerms`에 동시에 있거나 수강 중 과목 목록에서 중복되면 HTTP 422를 반환합니다.
- 과거 재수강 내역은 브라우저에서 유효한 최종 인정 기록만 정리하여 `completedCourses`에 과목별로 한 번 포함합니다.
- 과거 재수강의 실제 학점 인정 여부가 불명확하면 `needs_review`로 처리하고 확인 전에는 취득 학점에 포함하지 않습니다.
- 존재하지 않는 `courseId`는 정상 데이터로 인정하지 않습니다.

향후 재수강 계획과 대체 학점 계산은 P0 범위에서 제외하고 추후 별도 계약으로 정의합니다.

### 4.5 선수 관계 검사

필수 선수 관계는 학기 순서를 비교하여 검사합니다.

- 선수 과목이 이전 학기에 이수 완료됨: 정상
- 선수 과목이 이전 학기에 계획되어 있음: 계획상 정상
- 선수 과목이 같은 학기에 배치됨: 위반
- 선수 과목이 더 늦은 학기에 배치됨: 위반
- 필수 선수 과목이 누락됨: 위반
- 선수 과목의 이수 여부가 불명확함: 확인 필요
- 공식 필수 선수 조건 정보가 `null`임: 확인 필요(`unknown`)

권장 선행 과목은 필수 선수 조건과 구분하여 안내합니다.

---

## 5. API 계약

### 5.1 공통 원칙

모든 API는 JSON을 사용합니다.

요청 본문이 있는 API에는 다음 헤더를 사용합니다.

```http
Content-Type: application/json
```

성공 응답은 API별 정의된 JSON 형식을 반환합니다.

오류 응답은 공통 형식을 사용합니다.

### 5.2 API 목록

| 메서드 | 경로 | 담당 | 우선순위 |
| --- | --- | --- | --- |
| `GET` | `/api/health` | 공통 | P0 |
| `GET` | `/api/departments` | 이태희 | P0 |
| `GET` | `/api/curriculum/:dept` | 이태희 | P0 |
| `POST` | `/api/ai/match-courses` | 박현수 | P0 |
| `POST` | `/api/validate` | 조찬희 | P0 |

계획 저장·공유 API는 P2 기능으로 분리하며, 이번 계약에 포함하지 않습니다.

---

### 5.3 GET /api/health

**목적**

Express 서버의 실행 상태를 확인합니다.

**요청**

```http
GET /api/health
```

**성공 응답**

HTTP 200

```json
{
  "status": "ok",
  "service": "CurriTree"
}
```

현재 `server/app.js`의 실제 응답 형식과 동일하게 유지합니다.

---

### 5.4 GET /api/departments

**목적**

선택 가능한 학과, 학과별 교육과정 목록 및 기본 교육과정을 반환합니다.

**요청**

```http
GET /api/departments
```

**성공 응답**

HTTP 200

```json
{
  "schemaVersion": 1,
  "departments": [
    {
      "id": "ce",
      "name": "컴퓨터정보공학부",
      "defaultCurriculumId": "ce-demo-2026",
      "curricula": [
        {
          "id": "ce-demo-2026",
          "catalogYear": 2026,
          "admissionYears": [2026],
          "isDemo": true
        }
      ]
    }
  ]
}
```

지원하지 않는 학과는 목록에 포함하지 않습니다.

**응답 필드 규칙**

- `departments[].id`: 학과 고유 ID이며 교육과정 JSON의 `department.id`와 일치
- `defaultCurriculumId`: 해당 학과에서 기본으로 선택할 교육과정 ID
- `curricula`: 해당 학과에서 조회 가능한 교육과정 목록
- `curricula[].id`: 교육과정 JSON의 `curriculumId`와 일치
- `curricula[].catalogYear`, `admissionYears`, `isDemo`: 해당 교육과정 JSON과 동일한 값
- `defaultCurriculumId`는 반드시 같은 학과의 `curricula[].id` 중 하나여야 함

P0에서는 학과별 교육과정을 하나만 등록해도 됩니다. 여러 입학년도 데이터가 추가되면 `curricula`에 항목을 늘리고, 사용자가 자신의 입학년도에 적용되는 교육과정을 선택할 수 있도록 합니다. 동일한 입학년도에 여러 교육과정이 적용 가능하면 임의로 확정하지 않고 사용자에게 선택하도록 안내합니다.

---

### 5.5 GET /api/curriculum/:dept

**목적**

학과의 과목 및 이수요건 데이터를 반환합니다.

**요청**

```http
GET /api/curriculum/ce?curriculumId=ce-demo-2026
```

`curriculumId`는 선택 사항이며, 생략하면 학과의 기본 교육과정을 반환합니다.

**성공 응답**

HTTP 200

응답 본문은 2.5절에서 정의한 교육과정 JSON 구조를 그대로 사용합니다.

**오류**

| 상황 | HTTP | 공통 오류 코드 |
| --- | --- | --- |
| `:dept`가 학과 ID 형식을 위반함 | 400 | `INVALID_REQUEST` |
| 학과 ID 형식은 맞지만 등록된 학과가 아님 | 404 | `DEPARTMENT_NOT_FOUND` |
| `curriculumId` 쿼리의 형식이 잘못됨 | 400 | `INVALID_REQUEST` |
| 요청한 교육과정이 등록되지 않음 | 404 | `CURRICULUM_NOT_FOUND` |
| 다른 학과에 속한 `curriculumId`를 요청함 | 404 | `CURRICULUM_NOT_FOUND` |
| 서버 교육과정 데이터가 손상됨 | 500 | `INTERNAL_ERROR` |

학과 ID 형식은 `^[a-z][a-z0-9-]*$`, 교육과정 ID 형식은 `^[a-z0-9]+(?:-[a-z0-9]+)*$`로 검사합니다. 형식 오류는 400, 형식은 유효하지만 해당 학과 또는 교육과정을 찾을 수 없는 경우는 404로 구분합니다.

`curriculumId`가 존재하더라도 `:dept`와 소속 학과가 다르면 반환하지 않습니다. 상세 오류 응답은 6절의 공통 JSON 형식을 따릅니다.

---

### 5.6 POST /api/ai/match-courses

**담당: 박현수**

**목적**

규칙 기반으로 매칭하기 어려운 과목명을 LLM으로 분석하고 후보를 반환합니다.

**요청**

```http
POST /api/ai/match-courses
Content-Type: application/json
```

**요청 JSON**

```json
{
  "schemaVersion": 1,
  "curriculumId": "ce-demo-2026",
  "unmatchedCourses": [
    {
      "clientId": "local-001",
      "name": "기계학습개론"
    }
  ]
}
```

`clientId`는 브라우저에서 생성한 임시 식별자입니다.

이름, 학번, 성적, KLAS 원본 행 등 개인정보가 포함된 값은 전달하지 않습니다.

**성공 응답**

HTTP 200

```json
{
  "schemaVersion": 1,
  "results": [
    {
      "clientId": "local-001",
      "status": "suggested",
      "candidates": [
        {
          "courseId": "demo-ml",
          "confidence": "medium",
          "reason": "과목명과 학습 분야가 유사한 후보입니다."
        }
      ]
    }
  ]
}
```

**응답 규칙**

- `status`: `suggested` 또는 `unmatched`
- `courseId`: 실제 교육과정 JSON에 존재하는 ID만 허용
- `confidence`: `high`, `medium`, `low`
- `reason`: 사용자에게 표시할 간단한 추천 이유
- 후보가 없으면 `status: unmatched`, `candidates: []` 반환

`confidence`는 참고 정보이며 자동 확정 기준으로 사용하지 않습니다.

LLM이 존재하지 않는 과목 ID를 반환하면 해당 후보를 제거합니다.

최종 매칭 결과는 반드시 사용자가 확인해야 합니다.

**오류 처리**

- 요청 형식 오류: HTTP 400
- 교육과정 없음: HTTP 404
- LLM 사용 불가: HTTP 503

LLM을 사용할 수 없는 경우 프론트엔드는 수동 과목 선택 기능을 제공합니다.

---

### 5.7 POST /api/validate

**담당: 조찬희**

**목적**

이수 완료 과목과 학기별 수강 계획을 검증합니다.

**요청**

```http
POST /api/validate
Content-Type: application/json
```

**요청 JSON**

```json
{
  "schemaVersion": 1,
  "curriculumId": "ce-demo-2026",
  "completedCourses": [
    {
      "courseId": "demo-prog",
      "termId": "2025-1",
      "earnedCredits": 3
    },
    {
      "courseId": "demo-ds",
      "termId": "2026-1",
      "earnedCredits": 3
    }
  ],
  "inProgressCourses": [],
  "otherEarnedCredits": {
    "general_required": 0,
    "general_elective": 3,
    "foundation_required": 0,
    "foundation_elective": 0,
    "free_elective": 0
  },
  "plannedTerms": [
    {
      "termId": "2027-1",
      "courseIds": ["demo-ml"]
    }
  ],
  "reviewPendingCount": 0
}
```

**성공 응답**

HTTP 200

```json
{
  "schemaVersion": 1,
  "overallStatus": "unknown",
  "summary": {
    "earnedTotalCredits": 9,
    "inProgressCredits": 0,
    "plannedCredits": 3,
    "projectedTotalCredits": 12,
    "earnedMajorCredits": 6,
    "projectedMajorCredits": 9,
    "projectedMajorElectiveCredits": 3
  },
  "checks": {
    "totalCredits": {
      "status": "unknown",
      "earned": 9,
      "projected": 12,
      "required": null,
      "missing": null
    },
    "majorCredits": {
      "status": "met",
      "earned": 6,
      "projected": 9,
      "required": 9,
      "missing": 0
    },
    "majorElectiveCredits": {
      "status": "met",
      "earned": 0,
      "projected": 3,
      "required": 3,
      "missing": 0
    },
    "requiredCourses": {
      "status": "met",
      "missingCourseIds": []
    },
    "prerequisites": {
      "status": "met",
      "issues": []
    },
    "termCreditLimit": {
      "status": "met",
      "issues": []
    },
    "inputReview": {
      "status": "met",
      "reviewPendingCount": 0
    }
  },
  "warnings": [
    "총 졸업 학점 기준이 확인되지 않아 전체 이수요건을 확정할 수 없습니다."
  ]
}
```

위 결과는 개발용 예시 데이터에 대한 계산 결과입니다.

`minimumTotalCredits`가 `null`이므로 총 학점 판정은 `unknown`입니다.

`summary.inProgressCredits`는 현재 수강 중인 과목의 예상 학점 합계입니다. 예시 요청에서는 `inProgressCourses`가 비어 있으므로 `0`입니다. `summary.projectedTotalCredits`는 취득 학점, 수강 중 학점, 계획 학점을 모두 합한 값입니다.

`checks.inputReview.status`는 `reviewPendingCount`가 `0`이면 `met`, `0`보다 크면 `unknown`입니다. 과목명 매칭·재수강 인정·성적 공란 등 확인이 필요한 항목이 남아 있을 때 `met`로 확정되지 않도록 합니다.

**상태 값**

| 값 | 의미 |
| --- | --- |
| `met` | 요건 충족 |
| `unmet` | 요건 미충족 |
| `unknown` | 확인 불가 |

**전체 판정 규칙**

1. 미충족 항목이 하나라도 있으면 `unmet`
2. 미충족 항목은 없지만 확인 불가능한 항목이 있거나 `reviewPendingCount > 0`이면 `unknown`
3. 모든 항목이 충족되고 `reviewPendingCount = 0`이면 `met`

`reviewPendingCount > 0`이어도 다른 항목에 `unmet`이 있으면 `unmet`을 우선합니다. 확인되지 않은 과목을 사용자가 승인하지 않은 상태에서 이수 완료로 자동 반영해서는 안 됩니다.

`met`는 실제 졸업 확정이 아니라 입력된 계획을 기준으로 한 이수요건 충족을 의미합니다.

**오류 처리**

- 잘못된 JSON 및 필수 필드 누락: HTTP 400
- 존재하지 않는 교육과정: HTTP 404
- 존재하지 않는 과목 ID 또는 유효하지 않은 계획: HTTP 422
- 서버 내부 오류: HTTP 500

---

## 6. 공통 오류 응답

모든 API에서 다음 오류 형식을 사용합니다.

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "INVALID_PLAN",
    "message": "수강 계획에 유효하지 않은 과목 ID가 포함되어 있습니다.",
    "details": [
      {
        "field": "plannedTerms[0].courseIds[0]",
        "reason": "존재하지 않는 과목 ID"
      }
    ]
  }
}
```

### HTTP 상태 코드

| 상태 코드 | 의미 |
| --- | --- |
| 200 | 정상 처리 |
| 400 | 잘못된 요청 형식 |
| 404 | 요청한 리소스 없음 |
| 422 | 형식은 올바르지만 데이터 규칙 위반 |
| 500 | 서버 내부 오류 |
| 503 | LLM 등 외부 서비스 사용 불가 |

### 공통 오류 코드

- `INVALID_REQUEST`
- `DEPARTMENT_NOT_FOUND`
- `CURRICULUM_NOT_FOUND`
- `INVALID_PLAN`
- `UNKNOWN_COURSE_ID`
- `AI_UNAVAILABLE`
- `INTERNAL_ERROR`

오류 메시지에 KLAS 원문이나 개인정보를 포함하지 않습니다.

---

## 7. 공통 계산 및 검증 원칙

### 7.1 계산 규칙 분리

계산 규칙은 화면 코드와 분리된 JavaScript 함수로 작성합니다.

- 교육과정 데이터 검사
- 과목명 및 학정번호 정규화
- 이수 상태 분류
- 과목 매칭
- 학점 합산
- 선수 관계 검사
- 이수요건 검증

화면은 결과를 표시하고, 서버는 검증된 계산 결과를 반환합니다.

### 7.2 총 학점 계산

총 취득 학점은 다음 항목을 합산합니다.

```text
전공 이수 완료 학점
+ 전공 외 이수 완료 학점
= 총 취득 학점
```

계획상 예상 학점은 다음과 같이 계산합니다.

```text
총 취득 학점
+ 수강 중 과목의 예상 학점
+ 향후 계획 과목의 예상 학점
= 계획상 예상 학점
```

현재 취득 학점에는 수강 중인 과목과 예정 과목을 포함하지 않습니다.

`summary`의 학점 필드는 다음 방식으로 계산합니다.

- `earnedTotalCredits`: 실제 이수 완료한 과목 + 전공 외 취득 학점
- `inProgressCredits`: `inProgressCourses`에 있는 과목의 학점
- `plannedCredits`: `plannedTerms`에 배치한 과목의 학점
- `projectedTotalCredits`: `earnedTotalCredits + inProgressCredits + plannedCredits`

수강 중인 과목과 향후 계획 과목의 학점은 취득이 확정된 학점이 아닌 **예상 학점**입니다. 같은 `courseId`가 취득 완료·수강 중·계획에 중복되지 않도록 입력을 검증합니다.

삭제·미이수·중복 과목 학점은 합산하지 않습니다.

### 7.3 선수 관계 검사

선수 과목의 수강 시기가 대상 과목보다 이전이어야 합니다.

필수 선수 관계와 권장 관계는 구분하여 처리합니다.

학습 권장 관계를 위반한 경우에는 안내를 제공할 수 있지만, 이를 공식 수강 제한으로 단정하지 않습니다.

`hardPrerequisiteIds: null`은 필수 선수 과목이 없다는 뜻이 아니므로, 해당 과목의 선수 조건 검사는 `unknown`으로 처리합니다.

### 7.4 확인 불가능한 요건

다음 상황은 `unknown` 또는 `needs_review`로 처리합니다.

- 적용 교육과정이 확인되지 않음
- 공식 졸업요건 데이터가 없음
- 과목 매칭이 확정되지 않음
- 재수강 인정 여부가 불명확함
- 학점 인정 여부가 확인되지 않음
- `hardPrerequisiteIds` 또는 `requiredCourseIds`가 `null`임
- 사용자 확인이 필요한 항목(`reviewPendingCount`)이 남아 있음

확인 불가능한 정보를 임의로 충족 처리하지 않습니다.

---

## 8. 디렉터리 및 담당 범위

| 디렉터리 | 용도 |
| --- | --- |
| `public/` | HTML, CSS, 브라우저 JavaScript |
| `server/` | Express API 및 LLM 연동 |
| `shared/` | 공통 데이터 검사 및 계산 함수 |
| `data/` | 교육과정 JSON |
| `tests/` | 단위 테스트 및 API 테스트 |
| `docs/` | API·데이터 계약 및 개발 문서 |

### 팀원 A — 이태희

- 공통 디자인 및 초기 UI
- 교육과정 JSON 구조
- 교육과정 데이터 작성 및 검증
- 교육과정 조회 API
- 과목 탐색 및 그래프 관련 계산 규칙

### 팀원 B — 조찬희

- 커리큘럼 메이커
- 수강 계획 데이터 구조
- 학점 계산 및 선수 관계 검사
- 이수요건 검증 API
- 검증 규칙 단위 테스트

### 팀원 C — 박현수

- KLAS 텍스트 파싱
- 이수 상태 분류
- 규칙 기반 과목 매칭
- LLM 과목 매칭 API
- 개인정보 보호 및 오류 처리
- Docker 및 배포

공통 데이터 구조나 API 계약을 변경해야 할 경우 관련 담당자와 협의하고 문서를 먼저 갱신합니다.

---

## 9. 필수 테스트 사례

각 담당자는 정상·오류·경계값 사례를 포함하여 단위 테스트를 작성합니다.

### 9.1 교육과정 데이터

- [ ] 필수 필드가 모두 존재하는 정상 데이터
- [ ] `courses[].id`와 다른 데이터의 `courseId` 참조 관계 일치
- [ ] 중복 과목 ID
- [ ] 존재하지 않는 선수 과목 참조
- [ ] `recommendedPreviousIds`가 존재하지 않는 과목을 참조하는 경우
- [ ] `requiredCourseIds`가 존재하지 않는 과목을 참조하는 경우
- [ ] `hardPrerequisiteIds: null`과 `[]`의 차이 검사
- [ ] `requiredCourseIds: null`과 `[]`의 차이 검사
- [ ] 순환 선수 관계
- [ ] `recommendedTerm`의 허용 형식(`1-1`~`4-2`, `null`) 검사
- [ ] `offeredTerms` 허용값(`1`, `2`, `S`, `W`) 및 `null`·`[]` 구분 검사
- [ ] `aliases`, `courseCodes`가 `[]`일 때는 정상이고 `null`이면 오류
- [ ] 잘못된 이수구분 또는 진로 태그
- [ ] `isDemo: false`인데 공식 자료 출처 URL이 누락된 데이터
- [ ] `source.verifiedAt`의 `YYYY-MM-DD` 날짜 형식 검사
- [ ] 학과별 `curricula[].id`와 `defaultCurriculumId`의 참조 무결성 검사
- [ ] `curricula[].admissionYears`가 실제 교육과정 데이터와 일치하는지 확인

### 9.2 KLAS 텍스트

- [ ] 여러 학기의 텍스트 입력
- [ ] `2026학년도 1학기` 인식
- [ ] `2026학년도 계절학기(하계)` 인식
- [ ] `2025학년도 계절학기(동계)` 인식
- [ ] F 성적 처리
- [ ] P 성적 처리
- [ ] 성적이 없는 수강 중 과목 처리
- [ ] `D+(삭제)` 처리
- [ ] `D+(삭제)`가 `D+`보다 먼저 `deleted`로 판정되는지 검사
- [ ] 지난 학기의 성적 공란을 `needs_review`로 판정
- [ ] 재수강 중복 학점 방지
- [ ] 교양·일반선택 학점 분류
- [ ] 학정번호 형식이 다른 과목 처리

### 9.3 과목 매칭 및 LLM

- [ ] 정확히 일치하는 과목명
- [ ] 별칭으로 등록된 과목명
- [ ] 학정번호를 활용한 매칭
- [ ] 유사 과목이 여러 개 존재하는 경우
- [ ] 매칭 후보가 없는 경우
- [ ] LLM 응답 형식 오류
- [ ] 존재하지 않는 과목 ID 반환
- [ ] LLM 호출 실패
- [ ] 사용자 확인 없는 자동 확정 방지
- [ ] 개인정보가 LLM 요청에 포함되지 않는지 확인

### 9.4 이수요건 검증

- [ ] 정확히 최소 학점을 충족
- [ ] 최소 학점보다 1학점 부족
- [ ] 전공필수 과목 누락
- [ ] 전공선택 최소 학점 부족
- [ ] 동일 과목 중복 배치
- [ ] 이수 완료 과목을 계획에 다시 넣으면 HTTP 422 반환
- [ ] 이수 완료 과목을 현재 수강 중 목록에도 넣으면 HTTP 422 반환
- [ ] 수강 중 과목을 계획에 중복 배치하면 HTTP 422 반환
- [ ] 수강 중 과목을 현재 취득 학점에서 제외하고 예상 학점에만 합산
- [ ] `reviewPendingCount > 0`이면 전체 판정이 `met`가 되지 않음
- [ ] `unmet`과 확인 필요 항목이 동시에 있으면 `unmet` 우선
- [ ] 동일 학기 선수 과목 배치
- [ ] 더 늦은 학기에 선수 과목 배치
- [ ] 학기 학점 상한 초과
- [ ] 공식 이수요건 데이터가 없는 경우
- [ ] 이수 완료와 수강 예정 학점 구분

### 9.5 API

- [ ] 정상 요청 및 성공 응답
- [ ] `/api/health`가 `status`와 `service`를 모두 반환
- [ ] `/api/departments`가 학과별 `curricula` 목록 반환
- [ ] 필수 필드 누락
- [ ] 형식이 잘못된 학과 ID는 HTTP 400 / `INVALID_REQUEST`
- [ ] 형식은 올바르지만 존재하지 않는 학과는 HTTP 404 / `DEPARTMENT_NOT_FOUND`
- [ ] 다른 학과에 속한 `curriculumId` 요청은 HTTP 404 / `CURRICULUM_NOT_FOUND`
- [ ] 존재하지 않는 교육과정
- [ ] 유효하지 않은 과목 ID
- [ ] 잘못된 학기 형식
- [ ] LLM API 사용 불가
- [ ] 동일 입력에 대한 동일한 검증 결과

---

## 10. 계약 적용 및 변경 규칙

### 10.1 계약 버전

현재 계약 버전은 다음과 같습니다.

```json
{
  "schemaVersion": 1
}
```

호환되지 않는 데이터 구조 변경이 필요한 경우 관련 담당자와 협의하고 계약 버전을 갱신합니다.

### 10.2 구현 순서

1. 교육과정 JSON 구조에 맞춘 데이터 작성
2. 학과·교육과정 조회 API 구현
3. KLAS 텍스트 파싱 및 과목 매칭 구현
4. 수강 계획 편집 UI와 데이터 구조 연결
5. 이수요건 검증 API 구현
6. LLM 매칭 API 연동
7. 통합 테스트 및 배포

각 기능은 이 문서의 JSON 구조와 필드명을 기준으로 구현합니다.

### 10.3 계약 변경 절차

1. 변경이 필요한 필드 또는 API를 확인합니다.
2. 관련 담당자에게 변경 내용을 공유합니다.
3. `CONTRACT_CHECKLIST.md`를 수정합니다.
4. 변경 사항에 맞춰 테스트를 추가하거나 수정합니다.
5. Pull Request를 통해 리뷰를 받습니다.
6. 승인 후 `main`에 병합합니다.

API 계약이 변경될 경우 다른 팀원의 구현 코드에 미치는 영향을 함께 확인합니다.

---

## 11. 계약 확정 체크리스트

- [x] 교육과정 JSON 스키마 정의
- [x] 교육과정 `courses[].id`와 참조 필드 `courseId`의 사용 위치 구분
- [x] 학과 식별자 사용 위치 및 학과별 교육과정 목록 응답 정의
- [x] 개설 학기·확인 날짜 형식과 미확인 값 처리 정의
- [x] 전공 학점 합산 범위와 P0 교양 별도 요건 제외 명시
- [x] 과목 ID 및 학정번호 구분
- [x] 과목 이수구분 및 진로 태그 정의
- [x] 실제 학기 및 권장 학기 표현 방식 정의
- [x] 필수 선수 관계와 권장 관계 분리
- [x] 필수 선수 관계와 필수 이수 목록의 `null`·빈 배열 구분
- [x] KLAS 추출 데이터 구조 정의
- [x] 이수 완료·수강 중·미이수·삭제 상태 정의
- [x] 재수강 및 중복 학점 처리 원칙 정의
- [x] 수강 계획 JSON 구조 정의
- [x] 현재 수강 중인 과목의 객체 형식 및 예상 학점 합산 규칙 정의
- [x] P0에서 이수 완료·수강 중·계획 과목 중복 배치 처리 정의
- [x] 전공 외 취득 학점 처리 방식 정의
- [x] P0 API 목록 및 담당자 정의
- [x] 주요 API 요청·응답 예시 작성
- [x] LLM 과목 매칭 요청·응답 구조 정의
- [x] 이수요건 검증 결과 구조 정의
- [x] 미확인 항목이 남아 있을 때 전체 판정 우선순위 정의
- [x] 공통 오류 응답 및 HTTP 상태 코드 정의
- [x] 학과·교육과정 조회 오류의 400·404 구분 정의
- [x] Health API 응답을 실제 서버 구현과 일치시킴
- [x] 개인정보 보호 원칙 정의
- [x] 필수 테스트 사례 정의

> 본 문서는 CurriTree의 v1.0 구현 기준입니다. 실제 학교 교육과정 및 졸업요건 수치는 공식 자료 확인 후 등록하며, 데이터·API 계약 변경 시 문서를 먼저 갱신합니다.
