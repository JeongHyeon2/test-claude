/**
 * 스텁 어댑터 — 실제 모델을 붙이기 전까지 파이프라인(업로드→큐→결과→PDF)을
 * 끝까지 돌려 보기 위한 것. 영상 내용을 보지 않는다.
 *
 * 결과에 stub: true 를 달아 화면·PDF·메일이 전부 "실제 분석이 아님"을 표시하게 한다.
 * MODEL_ADAPTER=command 로 실제 모델을 붙이면 이 파일은 쓰이지 않는다.
 */
import { AnalysisError } from '../failures.js';
import { config } from '../config.js';

/** 해시에서 뽑은 시드로 같은 파일이면 같은 결과가 나오게 한다. */
function seeded(hex) {
  let s = parseInt(hex.slice(0, 8), 16) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export async function runStub(job, _videoPath) {
  const duration = job.duration_s ?? 30;
  if (duration < 1) throw new AnalysisError('INSUFFICIENT_MOTION', '분석 가능한 구간이 없습니다.');

  const rnd = seeded(job.sha256);
  const hz = 4;
  const cruise = 11 + rnd() * 14; // 약 40~90 km/h
  const brakeStart = duration * (0.45 + rnd() * 0.2);
  const brakeRate = 3.5 + rnd() * 3.5; // m/s^2
  const samples = [];

  for (let i = 0; i <= Math.floor(duration * hz); i += 1) {
    const t = i / hz;
    let v = cruise + Math.sin(t * 0.7) * 0.8 + (rnd() - 0.5) * 0.5;
    if (t > brakeStart) v = Math.max(0, v - brakeRate * (t - brakeStart));
    const band = config.model.fallbackBandMs;
    samples.push({
      t: Number(t.toFixed(3)),
      v: Number(Math.max(0, v).toFixed(3)),
      lo: Number(Math.max(0, v - band).toFixed(3)),
      hi: Number((v + band).toFixed(3)),
    });
  }

  // 실제 모델의 처리 시간을 흉내내 비동기 흐름(SC-03)을 눈으로 확인할 수 있게 한다.
  await new Promise((r) => setTimeout(r, Number(process.env.STUB_DELAY_MS ?? 1500)));

  return {
    modelVersion: 'stub-0',
    stub: true,
    samples,
    notes: ['스텁 어댑터로 생성된 값입니다. 영상 내용을 분석하지 않았습니다.'],
  };
}
