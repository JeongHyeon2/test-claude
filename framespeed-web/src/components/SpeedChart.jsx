import React, { useMemo } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';

const KIND = {
  acceleration: { label: '가속',  cls: 'chip-acc', fill: '#1a56db' },
  deceleration: { label: '감속',  cls: 'chip-dec', fill: '#b3261e' },
  steady:       { label: '정속',  cls: 'chip-std', fill: '#8b95a3' },
};
export const kindOf = (k) => KIND[k] || { label: k, cls: 'chip-std', fill: '#8b95a3' };

const n1 = (v) => (v == null ? '—' : Number(v).toFixed(1).replace(/\.0$/, ''));

/** 어느 구간에 속한 시각인지. 경계는 시작점 포함 · 끝점 제외로 본다 —
 *  그래야 8.8초가 '정속'과 '감속' 양쪽에 동시에 잡히지 않는다. */
function segmentAt(segments, t) {
  if (!segments || !segments.length) return null;
  const hit = segments.find((s) => t >= s.start_sec && t < s.end_sec);
  if (hit) return hit;
  // 마지막 구간의 끝점(= 충돌 시각)은 어느 구간에도 속하지 않게 되므로 직접 돌려준다.
  const last = segments[segments.length - 1];
  return t === last.end_sec ? last : null;
}

function TipBody({ active, payload, segments, margin, compact }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  const seg = segmentAt(segments, d.t);
  const k = seg ? kindOf(seg.kind) : null;
  return (
    <div className={`tip${compact ? ' tip-sm' : ''}`}>
      <div className="tip-t">{n1(d.t)}초 지점</div>
      <div className="tip-v">{n1(d.kmh)}<small>km/h</small></div>
      <div className="tip-rows">
        <div className="tip-row">
          <span>추정 범위</span>
          <span>{n1(d.low)} – {n1(d.high)} km/h</span>
        </div>
        {!compact && (
          <>
            <div className="tip-row">
              <span>가감속</span>
              <span>{d.accel > 0 ? '+' : ''}{n1(d.accel)} km/h·s</span>
            </div>
            <div className="tip-row">
              <span>오차</span>
              <span>±{n1(margin)} km/h</span>
            </div>
          </>
        )}
      </div>
      {seg && (
        <div className="tip-seg">
          {k.label} 구간 · {n1(seg.start_sec)}–{n1(seg.end_sec)}초
          {seg.delta_kmh != null && ` · ${seg.delta_kmh > 0 ? '+' : ''}${n1(seg.delta_kmh)} km/h`}
        </div>
      )}
    </div>
  );
}

export default function SpeedChart({ series, segments, margin = 0, impactAt, peakDecelAt, height = 320, compact = false }) {
  const data = useMemo(() => (series || []).map(([t, kmh, accel]) => ({
    t, kmh, accel,
    low: kmh - margin,
    high: kmh + margin,
    band: [kmh - margin, kmh + margin],
  })), [series, margin]);

  if (!data.length) return null;

  // 눈금이 27 · 37 · 47 처럼 어정쩡하게 떨어지지 않도록 축 범위를 10 단위로 맞춘다.
  const speeds = data.flatMap((d) => [d.low, d.high]);
  const lo = Math.max(0, Math.floor((Math.min(...speeds) - 5) / 10) * 10);
  const hi = Math.ceil((Math.max(...speeds) + 5) / 10) * 10;
  const domain = [lo, hi];
  const ticks = [];
  for (let v = lo; v <= hi; v += 10) ticks.push(v);
  const tMax = data[data.length - 1].t;

  return (
    <div>
      <div style={{ padding: '18px 12px 6px' }}>
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <defs>
              <linearGradient id="fs-band" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#1a56db" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#1a56db" stopOpacity={0.05} />
              </linearGradient>
            </defs>

            {/* 감속 구간을 배경으로 깔아 둔다. 마우스를 올리기 전에도
                "어디서 브레이크를 밟았나"가 먼저 보여야 한다. */}
            {(segments || []).filter((s) => s.kind === 'deceleration').map((s) => (
              <ReferenceArea key={s.id || s.seq} x1={s.start_sec} x2={s.end_sec}
                fill="#b3261e" fillOpacity={0.05} strokeOpacity={0} />
            ))}

            <CartesianGrid stroke="#eceff3" vertical={false} />
            <XAxis
              dataKey="t" type="number" domain={[0, tMax]}
              tickFormatter={(v) => `${v}s`} tickLine={false} axisLine={{ stroke: '#dfe3e9' }}
              tick={{ fill: '#8b95a3', fontSize: 12 }} tickMargin={8}
            />
            <YAxis
              domain={domain} ticks={ticks} width={46} tickLine={false} axisLine={false}
              tick={{ fill: '#8b95a3', fontSize: 12 }}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              content={<TipBody segments={segments} margin={margin} compact={compact} />}
              cursor={{ stroke: '#16191f', strokeWidth: 1, strokeDasharray: '3 3' }}
              offset={16} isAnimationActive={false}
            />

            <Area dataKey="band" stroke="none" fill="url(#fs-band)" isAnimationActive={false} />
            <Line
              dataKey="kmh" stroke="#1a56db" strokeWidth={2} dot={false}
              activeDot={{ r: 5, fill: '#1a56db', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {peakDecelAt != null && (
              <ReferenceLine x={peakDecelAt} stroke="#b3261e" strokeWidth={1} strokeDasharray="4 4"
                label={compact ? undefined : { value: '최대 감속', position: 'insideBottomLeft', fill: '#b3261e', fontSize: 11, offset: 8 }} />
            )}
            {impactAt != null && (
              <ReferenceLine x={impactAt} stroke="#16191f" strokeWidth={1.25}
                label={compact ? undefined : { value: '충돌 추정', position: 'insideTopRight', fill: '#16191f', fontSize: 11, offset: 8 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span><i style={{ background: '#1a56db' }} />추정 속도</span>
        <span><i style={{ background: '#b6c8ef' }} />오차 범위 ±{n1(margin)}km/h</span>
        <span><i style={{ background: '#eecdc9' }} />감속 구간</span>
        {!compact && (
          <span style={{ marginLeft: 'auto' }}>그래프에 마우스를 올리면 해당 시점 값이 표시됩니다</span>
        )}
      </div>
    </div>
  );
}
