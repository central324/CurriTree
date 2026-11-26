/**
 * 요청을 시작한 시점과 응답을 적용하는 시점의
 * 교육과정·수강 계획·입학년도 상태를 비교합니다.
 */
export function isMakerRequestCurrent(previous, current) {
  if (!previous || !current) {
    return false;
  }

  return (
    current.supported === true &&
    previous.version === current.version &&
    previous.curriculum === current.curriculum &&
    previous.plan === current.plan &&
    previous.admissionYear === current.admissionYear
  );
}
