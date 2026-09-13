export const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1).replace(/\.0$/, ''));

const p2 = (x) => String(x).padStart(2, '0');

/** 2026.02.12 09:07 — 표와 머리말에서 자릿수가 흔들리지 않게 고정폭으로 쓴다. */
export const dt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** 2026.02.12 — 목록처럼 날짜만 필요한 자리 */
export const d8 = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
};
