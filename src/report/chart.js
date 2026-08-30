/**
 * 그래프 좌표 계산 — 화면(SVG)과 PDF 가 같은 기하를 쓴다.
 * 렌더러가 둘이어도 그림이 갈라지지 않게 계산은 여기 한 곳에서만 한다.
 */
import { msToKmh } from '../analysis.js';

export function chartGeometry(report, { width = 720, height = 300, pad = { t: 16, r: 16, b: 34, l: 46 } } = {}) {
  const { samples, decelerations } = report;
  const t0 = samples[0].t;
  const t1 = samples.at(-1).t;
  const maxHi = Math.max(...samples.map((s) => s.hi));
  const yMax = Math.max(10, Math.ceil(msToKmh(maxHi) / 10) * 10 + 10);
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const x = (t) => pad.l + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * plotW);
  const y = (ms) => pad.t + plotH - (msToKmh(ms) / yMax) * plotH;

  const line = samples.map((s) => [x(s.t), y(s.v)]);
  // 음영(신뢰구간)은 위쪽 경계 → 아래쪽 경계 역순으로 닫아 하나의 폴리곤으로 만든다.
  const band = [
    ...samples.map((s) => [x(s.t), y(s.hi)]),
    ...[...samples].reverse().map((s) => [x(s.t), y(s.lo)]),
  ];

  const yStep = yMax <= 60 ? 10 : 20;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += yStep) yTicks.push({ y: pad.t + plotH - (v / yMax) * plotH, label: String(v) });

  const span = t1 - t0;
  const xStep = span <= 20 ? 5 : span <= 60 ? 10 : 30;
  const xTicks = [];
  for (let t = Math.ceil(t0 / xStep) * xStep; t <= t1; t += xStep) xTicks.push({ x: x(t), label: `${t}s` });

  const decelBands = decelerations.map((d) => ({
    x0: x(d.startT), x1: Math.max(x(d.endT), x(d.startT) + 1.5), startT: d.startT, endT: d.endT,
  }));

  return { width, height, pad, plotW, plotH, x, y, line, band, xTicks, yTicks, yMax, decelBands, t0, t1 };
}

export const pointsAttr = (pts) => pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
