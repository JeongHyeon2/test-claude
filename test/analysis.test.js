import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSamples, detectDecelerations, summarize, segment,
  pickEvidenceTimestamps, buildReport,
} from '../src/analysis.js';
import { config } from '../src/config.js';

/** 20 m/s 로 5초 순항 후 5 m/s^2 로 감속. */
function brakingSamples() {
  const out = [];
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 4;
    const v = t <= 5 ? 20 : Math.max(0, 20 - 5 * (t - 5));
    out.push({ t, v });
  }
  return out;
}

test('신뢰구간이 없으면 설정된 폭으로 채운다', () => {
  const [s] = normalizeSamples([{ t: 0, v: 10 }]);
  assert.equal(s.lo, 10 - config.model.fallbackBandMs);
  assert.equal(s.hi, 10 + config.model.fallbackBandMs);
});

test('음수 속도는 0 으로 잘린다', () => {
  const [s] = normalizeSamples([{ t: 0, v: -3, lo: -5, hi: 1 }]);
  assert.equal(s.v, 0);
  assert.equal(s.lo, 0);
});

test('감속 구간을 찾아낸다', () => {
  const decels = detectDecelerations(normalizeSamples(brakingSamples()));
  assert.equal(decels.length, 1);
  const [d] = decels;
  assert.ok(Math.abs(d.startT - 5) < 0.3, `시작 ${d.startT}`);
  assert.ok(d.rateMs2 > 4 && d.rateMs2 < 6, `감속도 ${d.rateMs2}`);
  assert.ok(d.dropMs > 15);
});

test('정속 주행에서는 감속 구간이 잡히지 않는다', () => {
  const flat = Array.from({ length: 40 }, (_, i) => ({ t: i / 4, v: 18 + Math.sin(i) * 0.2 }));
  assert.equal(detectDecelerations(normalizeSamples(flat)).length, 0);
});

test('요약은 평균·최고·감속 건수를 낸다', () => {
  const samples = normalizeSamples(brakingSamples());
  const s = summarize(samples, detectDecelerations(samples));
  assert.equal(s.maxMs, 20);
  assert.equal(s.decelerationCount, 1);
  assert.ok(s.avgMs > 0 && s.avgMs < 20);
});

test('구간 요약은 오차 범위 열을 함께 낸다', () => {
  const rows = segment(normalizeSamples(brakingSamples()), 5);
  assert.ok(rows.length >= 2);
  for (const r of rows) assert.ok(r.hiMs >= r.maxMs && r.loMs <= r.minMs);
});

test('근거 프레임 시각은 판단이 갈리는 지점을 고르고 3~5장을 넘지 않는다', () => {
  const samples = normalizeSamples(brakingSamples());
  const decels = detectDecelerations(samples);
  const picks = pickEvidenceTimestamps(samples, summarize(samples, decels), decels);
  assert.ok(picks.length >= config.evidenceFrames.min);
  assert.ok(picks.length <= config.evidenceFrames.max);
  assert.deepEqual(picks.map((p) => p.t), [...picks.map((p) => p.t)].sort((a, b) => a - b));
  assert.ok(picks.some((p) => p.label === '감속 시작'));
});

test('표본이 부족하면 INSUFFICIENT_MOTION 으로 분류한다', () => {
  assert.throws(
    () => buildReport({ modelVersion: 'x', samples: [{ t: 0, v: 1 }] }),
    (err) => err.code === 'INSUFFICIENT_MOTION',
  );
});

test('리포트는 화면·PDF 가 함께 쓰는 한 덩어리로 조립된다', () => {
  const report = buildReport({ modelVersion: 'test-1', samples: brakingSamples() });
  for (const key of ['model', 'samples', 'decelerations', 'summary', 'segments', 'evidence']) {
    assert.ok(key in report, `${key} 누락`);
  }
  assert.equal(report.model.stub, false);
});
