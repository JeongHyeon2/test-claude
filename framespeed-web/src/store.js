/* 사건 목록.
 *
 * 브라우저에 실린 키로는 jobs 를 읽을 수 없다(RLS). 그래서 "내가 조회한 사건"을
 * 이 브라우저에 쌓아 두고 목록으로 보여준다 — 실무에서 최근 작업 목록을 들고 있는 것과 같다.
 * 사건 내용 자체는 저장하지 않는다. 조회 번호와 표에 쓸 몇 줄만 둔다.
 */
const KEY = 'framespeed.cases.v1';
const SAMPLE = 'smpl_9f3a71c0be48d2115c7e0a9f4d83b672';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 사생활 모드 등 — 목록만 못 쌓는다 */ }
  return list;
}

export const SAMPLE_CODE = SAMPLE;

export function listCases() {
  const list = read();
  // 처음 열었을 때 빈 표만 보이면 무엇을 해야 하는지 알 수 없다. 예시 사건 하나를 깔아 둔다.
  if (!list.length) return [{ code: SAMPLE, sample: true, opened_at: null }];
  return list;
}

export function upsertCase(row) {
  const list = read().filter((c) => c.code !== row.code);
  list.unshift({ ...row, opened_at: new Date().toISOString() });
  return write(list.slice(0, 200));
}

export function removeCase(code) {
  return write(read().filter((c) => c.code !== code));
}
