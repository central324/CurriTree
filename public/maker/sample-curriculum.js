/**
 * ⚠️ 화면 개발용 예시 데이터입니다. 실제 광운대학교 교육과정이 아닙니다.
 *
 * 과목명·학점·선수 관계·졸업 기준 모두 임의로 만든 값이며,
 * 공식 전공이수체계도를 검증한 데이터가 data/에 추가되면
 * `GET /api/curriculum/:dept` 응답으로 교체합니다.
 */

const course = (id, name, credits, type, semester, prerequisites = [], tags = []) => ({
  id,
  name,
  credits,
  type,
  recommendedSemester: semester,
  prerequisites,
  tags,
});

export const SAMPLE_CURRICULUM = {
  department: { id: 'sample-ce', name: '컴퓨터정보공학부' },
  label: '예시 교육과정',
  courses: [
    course('PF', '프로그래밍기초', 3, '전필', '1-1'),
    course('DM', '이산수학', 3, '전필', '1-1', [], ['AI']),
    course('ICE', '컴퓨터공학입문', 2, '전선', '1-1'),
    course('AP', '고급프로그래밍', 3, '전필', '1-2', ['PF']),
    course('DL', '디지털논리', 3, '전필', '1-2', [], ['시스템']),
    course('LA', '선형대수', 3, '전선', '1-2', [], ['AI']),
    course('DS', '자료구조', 3, '전필', '2-1', ['AP', 'DM']),
    course('OOP', '객체지향프로그래밍', 3, '전선', '2-1', ['AP'], ['백엔드']),
    course('CA', '컴퓨터구조', 3, '전필', '2-1', ['DL'], ['시스템']),
    course('PS', '확률과통계', 3, '전선', '2-1', [], ['AI']),
    course('AL', '알고리즘', 3, '전필', '2-2', ['DS']),
    course('SP', '시스템프로그래밍', 3, '전선', '2-2', ['CA'], ['시스템', '보안']),
    course('WEB', '웹프로그래밍', 3, '전선', '2-2', ['OOP'], ['백엔드']),
    course('OS', '운영체제', 3, '전필', '3-1', ['DS', 'SP'], ['시스템']),
    course('DB', '데이터베이스', 3, '전선', '3-1', ['DS'], ['백엔드']),
    course('NW', '컴퓨터네트워크', 3, '전선', '3-1', [], ['보안', '백엔드']),
    course('AI', '인공지능', 3, '전선', '3-1', ['AL', 'PS'], ['AI']),
    course('SE', '소프트웨어공학', 3, '전선', '3-2', ['OOP']),
    course('ML', '기계학습', 3, '전선', '3-2', ['AI', 'LA'], ['AI']),
    course('SEC', '정보보호', 3, '전선', '3-2', ['NW'], ['보안']),
    course('CP', '컴파일러', 3, '전선', '3-2', ['AL'], ['시스템']),
    course('CD1', '캡스톤디자인1', 3, '전필', '4-1', ['SE']),
    course('DLN', '딥러닝', 3, '전선', '4-1', ['ML'], ['AI']),
    course('CC', '클라우드컴퓨팅', 3, '전선', '4-1', ['OS', 'NW'], ['백엔드']),
    course('CD2', '캡스톤디자인2', 3, '전필', '4-2', ['CD1']),
    course('NS', '네트워크보안', 3, '전선', '4-2', ['SEC'], ['보안']),
  ],
  requirements: {
    majorCredits: 60,
    electiveCredits: 30,
    maxCreditsPerSemester: 21,
  },
  tags: ['AI', '보안', '백엔드', '시스템'],
};

// 전공필수 목록은 과목 데이터에서 계산합니다.
SAMPLE_CURRICULUM.requirements.requiredCourses = SAMPLE_CURRICULUM.courses
  .filter((item) => item.type === '전필')
  .map((item) => item.id);

/** 처음 열었을 때 보여 줄 프리셋 두 개 (현재 학기 이후 칸만 채움) */
export const SAMPLE_PRESETS = [
  {
    name: 'AI 진로',
    future: {
      '2-2': ['AL', 'WEB', 'SP'],
      '3-1': ['OS', 'AI', 'DB', 'NW'],
      '3-2': ['ML', 'SE', 'CP'],
      '4-1': ['CD1', 'DLN'],
      '4-2': ['CD2'],
    },
  },
  {
    name: '보안 진로',
    future: {
      '2-2': ['AL', 'SP'],
      '3-1': ['OS', 'NW', 'DB'],
      '3-2': ['SE', 'CP'],
      '4-1': ['CD1', 'CC', 'SEC', 'NS'],
    },
  },
];

/**
 * '예시 텍스트 넣기' 버튼용 가상 성적조회 텍스트 (실제 학생 정보 아님)
 * KLAS 표를 복사하면 칸이 탭으로 구분됩니다.
 */
export const SAMPLE_KLAS_TEXT = [
  '2025학년도 1학기',
  '학정번호\t과목명\t이수구분\t학점\t성적',
  'S0001\t프로그래밍기초\t전필\t3\tA+',
  'S0002\t이산수학\t전필\t3\tB+',
  'S9001\t대학글쓰기\t교필\t2\tA0',
  '2025학년도 2학기',
  'S0003\t고급프로그래밍\t전필\t3\tA0',
  'S0004\t디지털논리\t전필\t3\tF',
  'S0005\t선형대수\t전선\t3\tB0',
  '2025학년도 겨울학기',
  'S0004\t디지털논리\t전필\t3\tB+',
  '2026학년도 1학기',
  'S0006\t자료구조\t전필\t3\tA0',
  'S0007\t객체지향프로그래밍\t전선\t3\tA+',
  'S0008\t컴퓨터구조\t전필\t3\tB+',
  'S9002\t영어회화\t교선\t2\tP',
  '2026학년도 2학기',
  'S0009\t알고리즘\t전필\t3\t',
  'S0010\t시스템프로그래밍\t전선\t3\t',
  'S0011\t확률과통계\t전선\t3\t',
].join('\n');
