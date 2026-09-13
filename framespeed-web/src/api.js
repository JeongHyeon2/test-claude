/* Supabase REST.
 *
 * 이 키는 브라우저에 노출되는 것이 정상이다 — 방어선은 키가 아니라 DB 의 RLS + GRANT 다.
 * 이 키로 할 수 있는 일은 공개 샘플 읽기와 조회 함수 get_result_by_token 뿐이다.
 */
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const headers = () => ({
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
});

async function handle(res) {
  if (!res.ok) throw new Error(`불러오지 못했습니다 (HTTP ${res.status})`);
  return res.json();
}

export const rpc = (name, body) =>
  fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).then(handle);

export const fetchReport = (code) => rpc('get_result_by_token', { p_token: code });
