/**
 * 모델 출력 → 리포트 데이터.
 *
 * 감속 구간을 평균·최고 속도와 같은 층위로 계산한다.
 * 감속은 차이값이라 절대 오차의 영향이 덜하고, 과실 판단에서 더 자주 쟁점이 된다 (브리프 §1).
 */
import { config } from './config.js';

export const msToKmh = (v) => v * 3.6;

export function normalizeSamples(raw) {
  const band = config.model.fallbackBandMs;
  return raw
    .filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v))
    .map((s) => ({
      t: Number(s.t),
      v: Math.max(0, Number(s.v)),
      lo: Math.max(0, Number.isFinite(s.lo) ? Number(s.lo) : s.v - band),
      hi: Number.isFinite(s.hi) ? Number(s.hi) : Number(s.v) + band,
    }))
    .sort((a, b) => a.t - b.t);
}

/**
 * 감속 구간 탐지.
 * 연속으로 속도가 떨어지는 구간을 모으고, 임계값(설정) 이상만 남긴다.
 */
export function detectDecelerations(samples) {
  const { minRateMs2, minDropMs, minDurationSeconds } = config.deceleration;
  const out = [];
  let start = null;

  for (let i = 1; i < samples.length; i += 1) {
    const falling = samples[i].v < samples[i - 1].v;
    if (falling && start === null) start = i - 1;
    if ((!falling || i === samples.length - 1) && start !== null) {
      const endIdx = falling ? i : i - 1;
      const a = samples[start];
      const b = samples[endIdx];
      const dt = b.t - a.t;
      const drop = a.v - b.v;
      if (dt >= minDurationSeconds && drop >= minDropMs && drop / dt >= minRateMs2) {
        out.push({
          startT: a.t,
          endT: b.t,
          fromMs: a.v,
          toMs: b.v,
          dropMs: drop,
          durationS: dt,
          rateMs2: drop / dt,
        });
      }
      start = null;
    }
  }
  // 강한 감속 우선. 실무에서 먼저 보는 건 가장 급한 구간이다.
  return out.sort((x, y) => y.rateMs2 - x.rateMs2);
}

export function summarize(samples, decels) {
  const speeds = samples.map((s) => s.v);
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const maxIdx = speeds.indexOf(Math.max(...speeds));
  return {
    durationS: samples.at(-1).t - samples[0].t,
    avgMs: avg,
    maxMs: speeds[maxIdx],
    maxAtT: samples[maxIdx].t,
    minMs: Math.min(...speeds),
    decelerationCount: decels.length,
    strongestDeceleration: decels[0] ?? null,
  };
}

/** 구간별 요약 — PDF 의 "구간별 속도" 표. 기본 5초 버킷. */
export function segment(samples, bucketSeconds = 5) {
  const rows = [];
  if (samples.length === 0) return rows;
  const end = samples.at(-1).t;
  for (let t0 = samples[0].t; t0 < end; t0 += bucketSeconds) {
    const t1 = Math.min(t0 + bucketSeconds, end);
    const inBucket = samples.filter((s) => s.t >= t0 && s.t <= t1);
    if (inBucket.length === 0) continue;
    const vs = inBucket.map((s) => s.v);
    rows.push({
      startT: t0,
      endT: t1,
      avgMs: vs.reduce((a, b) => a + b, 0) / vs.length,
      minMs: Math.min(...vs),
      maxMs: Math.max(...vs),
      loMs: Math.min(...inBucket.map((s) => s.lo)),
      hiMs: Math.max(...inBucket.map((s) => s.hi)),
    });
  }
  return rows;
}

/**
 * 근거 프레임을 뽑을 시각 (3~5장).
 * "왜 이 숫자인지"의 유일한 근거이므로, 아무 데나가 아니라
 * 판단이 갈리는 지점 — 최고 속도, 감속 시작·종료 — 을 고른다.
 */
export function pickEvidenceTimestamps(samples, summary, decels) {
  const first = samples[0].t;
  const last = samples.at(-1).t;
  const wanted = [
    { t: first, label: '분석 시작' },
    { t: summary.maxAtT, label: '최고 속도 지점' },
  ];
  const d = decels[0];
  if (d) {
    wanted.push({ t: d.startT, label: '감속 시작' });
    wanted.push({ t: d.endT, label: '감속 종료' });
  }
  wanted.push({ t: last, label: '분석 종료' });

  const picked = [];
  for (const item of wanted) {
    if (picked.length >= config.evidenceFrames.max) break;
    const t = Math.min(Math.max(item.t, first), last);
    if (picked.some((p) => Math.abs(p.t - t) < 0.4)) continue;
    picked.push({ ...item, t });
  }
  // 최소 장수를 못 채우면 균등 간격으로 보충한다.
  let guard = 0;
  while (picked.length < Math.min(config.evidenceFrames.min, Math.max(1, Math.floor(last - first))) && guard < 10) {
    const t = first + ((last - first) * (picked.length + 1)) / (config.evidenceFrames.min + 1);
    if (!picked.some((p) => Math.abs(p.t - t) < 0.4)) picked.push({ t, label: '주행 구간' });
    guard += 1;
  }
  return picked.sort((a, b) => a.t - b.t);
}

/** 모델 출력을 리포트 한 덩어리로 조립한다. 이 구조가 화면·PDF·메일의 단일 입력이다. */
export function buildReport(modelOutput) {
  const samples = normalizeSamples(modelOutput.samples);
  if (samples.length < 2) {
    const err = new Error('속도 표본이 부족합니다.');
    err.code = 'INSUFFICIENT_MOTION';
    throw err;
  }
  const decelerations = detectDecelerations(samples);
  const summary = summarize(samples, decelerations);
  return {
    model: {
      version: modelOutput.modelVersion,
      stub: Boolean(modelOutput.stub),
      notes: modelOutput.notes ?? [],
    },
    samples,
    decelerations,
    summary,
    segments: segment(samples),
    evidence: pickEvidenceTimestamps(samples, summary, decelerations),
  };
}
