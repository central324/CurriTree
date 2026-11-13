// 교육과정 JSON 계약(docs/CONTRACT_CHECKLIST.md 2절)에서 쓰는 허용값 모음
// 값을 바꾸면 계약서도 함께 고치고 팀원과 합의합니다.

export const SCHEMA_VERSION = 1;

export const DEPARTMENT_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const CURRICULUM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// "2-1" = 2학년 1학기, "1" = 1학년 (학번·학기에 따라 1·2학기 중 언제든)
export const RECOMMENDED_TERM_PATTERN = /^[1-4](?:-[12])?$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CATEGORIES = [
  'major_required',
  'major_elective',
  'general_required',
  'general_elective',
  'foundation_required',
  'foundation_elective',
  'free_elective',
  'unknown',
];

export const OFFERED_TERMS = ['1', '2', 'S', 'W'];

// 컴퓨터정보공학부 전공 로드맵의 3개 트랙
export const TAGS = ['bigdata-ai', 'semiconductor-iot', 'hw-sw-convergence'];

export const REQUIREMENT_CREDIT_FIELDS = [
  'minimumTotalCredits',
  'minimumMajorCredits',
  'minimumMajorElectiveCredits',
  'maximumTermCredits',
];
