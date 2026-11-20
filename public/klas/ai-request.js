const FALLBACK_MESSAGE =
  'AI 추천 요청에 실패했습니다. 과목을 직접 선택할 수 있습니다.';

export async function requestAiMatches({
  curriculumId,
  unmatchedCourses,
  signal,
  fetchImpl = fetch,
}) {
  let response;

  try {
    // 이미 취소된 요청은 서버에 보내지 않습니다.
    signal?.throwIfAborted();

    response = await fetchImpl('/api/ai/match-courses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schemaVersion: 1,
        curriculumId,
        unmatchedCourses,
      }),
      signal,
    });

    // 요청 취소 후 도착한 응답은 처리하지 않습니다.
    signal?.throwIfAborted();
  } catch (error) {
    // 사용자가 취소한 요청을 네트워크 오류로 표시하지 않습니다.
    if (signal?.aborted || error?.name === 'AbortError') {
      throw error;
    }

    throw new Error(
      'AI 서버에 연결하지 못했습니다. ' +
      '네트워크 상태를 확인하거나 과목을 직접 선택해주세요.'
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        'AI 추천 요청 횟수를 초과했습니다. ' +
        '잠시 후 다시 시도하거나 과목을 직접 선택해주세요.'
      );
    }

    if (response.status === 503) {
      throw new Error(
        'AI 서비스를 사용할 수 없습니다. ' +
        '아래에서 과목을 직접 선택해주세요.'
      );
    }

    if (response.status === 400 || response.status === 404) {
      throw new Error(
        'AI 추천 요청 정보를 확인해주세요. ' +
        '과목을 직접 선택할 수도 있습니다.'
      );
    }

    throw new Error(FALLBACK_MESSAGE);
  }

  let data;

  try {
    data = await response.json();

    // JSON 처리 도중 취소된 요청도 결과를 반환하지 않습니다.
    signal?.throwIfAborted();
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') {
      throw error;
    }

    throw new Error(
      'AI 응답을 읽지 못했습니다. ' +
      '다시 시도하거나 과목을 직접 선택해주세요.'
    );
  }

  if (
    !data ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.results)
  ) {
    throw new Error(
      'AI 응답 형식이 올바르지 않습니다. ' +
      '과목을 직접 선택해주세요.'
    );
  }

  return data;
}
