export const SAMPLE_CURRENT_TERM = '2026-2';

const tableHeader = [
  '학정번호',
  '과목명',
  '개설학과',
  '이수구분',
  '학점',
  '성적',
  '인증구분',
  '재수강여부',
  '재수강이후',
].join('\t');

function createSampleRow(
  code,
  name,
  category,
  grade,
  department = '컴퓨터정보공학부'
) {
  return [
    code,
    name,
    department,
    category,
    '3',
    grade,
    '',
    '',
    '',
  ].join('\t');
}

// 실제 학생 기록이 아닌 체험용 가상 이수내역입니다.
export const SAMPLE_KLAS_TEXT = [
  '2025학년도 2학기',
  tableHeader,
  '삭제여부',
  createSampleRow(
    'I020-2-0453-01',
    '디지털논리회로1',
    '전필',
    'A0'
  ),
  createSampleRow(
    'I020-1-2339-01',
    '고급C프로그래밍',
    '전선',
    'B+'
  ),

  '2026학년도 1학기',
  tableHeader,
  '삭제여부',
  createSampleRow(
    'I020-2-3703-01',
    '데이터구조설계',
    '전필',
    'A+'
  ),
  createSampleRow(
    '0000-1-3415-01',
    '가상교양과목',
    '교선',
    'B0',
    '전체공통'
  ),

  '2026학년도 2학기',
  tableHeader,
  '삭제여부',
  createSampleRow(
    'I020-2-0454-01',
    '디지털논리회로2',
    '전필',
    ''
  ),
  createSampleRow(
    'I020-2-3712-01',
    '데이터구조실습',
    '전선',
    ''
  ),
].join('\n');
