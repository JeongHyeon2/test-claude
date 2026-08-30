import { chartGeometry, pointsAttr } from '../report/chart.js';
import { esc } from './layout.js';

/**
 * 시간축 속도 그래프.
 * 단정적인 선 하나만 그리면 제품이 아니라 위험 요소가 된다 (브리프 §3 SC-04).
 * 음영(신뢰구간)과 감속 구간 표시는 이 컴포넌트에서 분리하지 않는다.
 */
export function chartSvg(report, opts = {}) {
  const g = chartGeometry(report, opts);
  const grid = g.yTicks
    .map((t) => `<line x1="${g.pad.l}" y1="${t.y.toFixed(1)}" x2="${(g.width - g.pad.r).toFixed(1)}" y2="${t.y.toFixed(1)}" stroke="#e6e9ee"/>`)
    .join('');
  const yLabels = g.yTicks
    .map((t) => `<text x="${g.pad.l - 8}" y="${(t.y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#7a828e" font-family="IBM Plex Mono, monospace">${t.label}</text>`)
    .join('');
  const xLabels = g.xTicks
    .map((t) => `<text x="${t.x.toFixed(1)}" y="${g.height - g.pad.b + 16}" text-anchor="middle" font-size="10" fill="#7a828e" font-family="IBM Plex Mono, monospace">${esc(t.label)}</text>`)
    .join('');
  const decel = g.decelBands
    .map((d) => `<rect x="${d.x0.toFixed(1)}" y="${g.pad.t}" width="${(d.x1 - d.x0).toFixed(1)}" height="${g.plotH}" fill="#ff7a6b" fill-opacity="0.16"/>`)
    .join('');

  return `<svg viewBox="0 0 ${g.width} ${g.height}" width="100%" height="${g.height}" role="img"
   aria-label="시간에 따른 추정 속도와 오차 범위">
  <rect x="${g.pad.l}" y="${g.pad.t}" width="${g.plotW}" height="${g.plotH}" fill="#fff"/>
  ${grid}${decel}
  <polygon points="${pointsAttr(g.band)}" fill="#2b3ce8" fill-opacity="0.14"/>
  <polyline points="${pointsAttr(g.line)}" fill="none" stroke="#2b3ce8" stroke-width="2" stroke-linejoin="round"/>
  <line x1="${g.pad.l}" y1="${g.pad.t}" x2="${g.pad.l}" y2="${g.pad.t + g.plotH}" stroke="#c9cdd6"/>
  <line x1="${g.pad.l}" y1="${g.pad.t + g.plotH}" x2="${g.width - g.pad.r}" y2="${g.pad.t + g.plotH}" stroke="#c9cdd6"/>
  ${yLabels}${xLabels}
  <text x="${g.pad.l}" y="${g.pad.t - 4}" font-size="10" fill="#7a828e" font-family="IBM Plex Mono, monospace">km/h</text>
</svg>`;
}
