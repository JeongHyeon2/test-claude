/* 엑셀 내보내기.
 *
 * 시트를 만드는 buildBook() 은 순수 함수다 — 브라우저 API 를 쓰지 않으므로
 * Node 에서 그대로 불러 결과 파일을 검증할 수 있다. 파일로 떨구는 일만
 * downloadExcel() 이 맡는다.
 */
import { n1 } from './fmt.js';

const KIND = { acceleration: '가속', deceleration: '감속', steady: '정속' };
const kindLabel = (k) => KIND[k] || k;

const p2 = (x) => String(x).padStart(2, '0');
const stamp = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

/** 그 시각이 속한 구간. 경계는 시작 포함 · 끝 제외 — 8.8초가 두 구간에 겹치지 않게. */
function segmentAt(segments, t) {
  if (!segments?.length) return null;
  const hit = segments.find((s) => t >= s.start_sec && t < s.end_sec);
  if (hit) return hit;
  const last = segments[segments.length - 1];
  return t === last.end_sec ? last : null;
}

/** 근거 프레임 시각의 속도. 시계열에 그 시각이 없으면 앞뒤 표본을 선형 보간한다. */
function speedAt(series, t) {
  if (!series?.length) return null;
  const exact = series.find(([x]) => x === t);
  if (exact) return { kmh: exact[1], accel: exact[2], exact: true };

  let lo = null, hi = null;
  for (const s of series) {
    if (s[0] <= t && (!lo || s[0] > lo[0])) lo = s;
    if (s[0] >= t && (!hi || s[0] < hi[0])) hi = s;
  }
  if (!lo) return { kmh: hi[1], accel: hi[2], exact: false };
  if (!hi) return { kmh: lo[1], accel: lo[2], exact: false };
  const span = hi[0] - lo[0];
  const w = span === 0 ? 0 : (t - lo[0]) / span;
  return {
    kmh: lo[1] + (hi[1] - lo[1]) * w,
    accel: lo[2] + (hi[2] - lo[2]) * w,
    exact: false,
  };
}

const HEAD = { fontWeight: 'bold', backgroundColor: '#F2F4F7', align: 'left', borderBottomStyle: 'thin' };
// 8.8 - 6 은 2.8000000000000007 이 된다. 표시는 서식이 가려 주지만 셀에 담긴
// 값 자체가 지저분하면 받는 쪽에서 다시 계산할 때 그대로 따라간다.
const round3 = (v) => Math.round(Number(v) * 1000) / 1000;
const num = (v, fmt = '0.0') => ({ type: Number, value: v == null ? null : round3(v), format: fmt, align: 'right' });
const txt = (v) => ({ type: String, value: v == null ? '' : String(v) });
const head = (v) => ({ value: v, ...HEAD });

/**
 * 시트 4장과 열 너비를 만든다.
 * @param {object} d get_result_by_token 이 돌려준 그대로
 * @param {string} code 조회 번호
 */
export function buildBook(d, code) {
  const r = d.result;
  const segs = d.segments || [];
  const expires = new Date(new Date(d.analyzed_at).getTime() + 90 * 86400000);

  // ── 요약 ────────────────────────────────────────────
  const summary = [
    [head('항목'), head('값')],
    [txt('영상 파일'), txt(d.file_name)],
    [txt('조회 번호'), txt(code)],
    [txt('영상 해시 (SHA-256)'), txt(d.sha256)],
    [txt('분석 완료'), txt(stamp(d.analyzed_at))],
    [txt('모델'), txt(r.model_version)],
    [txt('결과 보관 만료'), txt(stamp(expires.toISOString()).slice(0, 10))],
    [txt(''), txt('')],
    [txt('추정 속도 구간'), txt(`${n1(r.band_low_kmh)} – ${n1(r.band_high_kmh)} km/h (${r.band_label})`)],
    [txt('평균 속도 (km/h)'), num(r.avg_kmh)],
    [txt('최고 속도 (km/h)'), num(r.max_kmh)],
    [txt('평균 오차 (± km/h)'), num(r.error_margin_kmh)],
    [txt('최대 감속 (km/h·s)'), num(r.peak_decel_kmh_s)],
    [txt('최대 감속 시각 (초)'), num(r.peak_decel_at_sec)],
    [txt('충돌 추정 시각 (초)'), num(r.impact_at_sec)],
    [txt(''), txt('')],
    [txt('고지'), txt(
      '이 결과는 영상 기반 자동 추정치로, 공식 감정 결과가 아닙니다. ' +
      `평균 오차는 약 ±${n1(r.error_margin_kmh)}km/h이며 촬영 조건에 따라 달라질 수 있습니다. ` +
      '법적 분쟁의 근거로 사용하기 전에 전문 감정기관의 검토를 권장합니다.')],
    [txt('인용 방법'), txt(`속도는 한 값이 아니라 ${n1(r.band_low_kmh)}–${n1(r.band_high_kmh)} km/h 구간으로 인용하세요.`)],
  ];

  // ── 시계열 ──────────────────────────────────────────
  const series = [[
    head('시각 (초)'), head('속도 (km/h)'), head('하한 (km/h)'), head('상한 (km/h)'),
    head('가감속 (km/h·s)'), head('구간'),
  ]];
  for (const [t, kmh, accel] of (r.series || [])) {
    const seg = segmentAt(segs, t);
    series.push([
      num(t), num(kmh), num(kmh - r.error_margin_kmh), num(kmh + r.error_margin_kmh),
      num(accel), txt(seg ? kindLabel(seg.kind) : ''),
    ]);
  }

  // ── 구간 ────────────────────────────────────────────
  const segments = [[
    head('순번'), head('구분'), head('시작 (초)'), head('종료 (초)'), head('지속 (초)'),
    head('속도 변화 (km/h)'), head('변화율 (km/h·s)'),
  ]];
  for (const s of segs) {
    segments.push([
      num(s.seq, '0'), txt(kindLabel(s.kind)), num(s.start_sec), num(s.end_sec),
      num(s.end_sec - s.start_sec), num(s.delta_kmh), num(s.rate_kmh_per_sec),
    ]);
  }

  // ── 근거 프레임 ─────────────────────────────────────
  const frames = [[
    head('번호'), head('영상 시각 (초)'), head('속도 (km/h)'), head('가감속 (km/h·s)'),
    head('구간'), head('속도 산출'),
  ]];
  for (const f of (d.frames || [])) {
    const at = speedAt(r.series, f.timestamp_sec);
    const seg = segmentAt(segs, f.timestamp_sec);
    frames.push([
      num(f.seq, '0'), num(f.timestamp_sec),
      num(at?.kmh), num(at?.accel),
      txt(seg ? kindLabel(seg.kind) : ''),
      txt(at?.exact ? '표본값' : '앞뒤 표본 선형 보간'),
    ]);
  }

  // write-excel-file v4 의 여러 시트 형식: { sheet, data, columns } 의 배열
  return [
    { sheet: '요약', data: summary,
      columns: [{ width: 22 }, { width: 72 }] },
    { sheet: '시계열', data: series,
      columns: [{ width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }, { width: 9 }] },
    { sheet: '구간', data: segments,
      columns: [{ width: 7 }, { width: 9 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 17 }, { width: 18 }] },
    { sheet: '근거 프레임', data: frames,
      columns: [{ width: 7 }, { width: 15 }, { width: 13 }, { width: 16 }, { width: 9 }, { width: 20 }] },
  ];
}

/** 파일명: FrameSpeed_영상이름_분석일.xlsx */
export function fileName(d) {
  const base = String(d.file_name || 'report').replace(/\.[^.]+$/, '').replace(/[^\w가-힣.-]+/g, '_');
  return `FrameSpeed_${base}_${stamp(d.analyzed_at).slice(0, 10)}.xlsx`;
}

/** 브라우저에서 내려받기. 라이브러리는 누를 때 불러온다 — 첫 화면을 무겁게 할 이유가 없다. */
export async function downloadExcel(d, code) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(buildBook(d, code)).toFile(fileName(d));
}
