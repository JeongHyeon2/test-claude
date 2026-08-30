/** 업로드 → 큐 → 워커 → 결과 → PDF 까지 한 번에 태우는 흐름 테스트. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeMp4, makeNonVideo } from './helpers/fixture.js';

process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-'));
process.env.MODEL_ADAPTER = 'stub';
process.env.STUB_DELAY_MS = '10';
process.env.WORKER_POLL_INTERVAL_MS = '30';
process.env.NODE_ENV = 'test';

const { createApp } = await import('../src/app.js');
const { startWorker } = await import('../src/worker.js');

const app = createApp();
const worker = startWorker();
const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => { worker.stop(); server.close(); });

const BOUNDARY = '----flowtest';

function multipart({ file, filename, fields }) {
  const parts = [];
  if (file) {
    parts.push(Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\n` +
      'Content-Type: video/mp4\r\n\r\n', 'latin1'));
    parts.push(file, Buffer.from('\r\n', 'latin1'));
  }
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'latin1'));
  }
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`, 'latin1'));
  return Buffer.concat(parts);
}

const upload = (opts) => fetch(`${base}/upload`, {
  method: 'POST',
  headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
  body: multipart(opts),
  redirect: 'manual',
});

const validFields = { email: 'tester@example.com', purpose: 'accident_dispute', consent: 'on' };

async function waitForDone(token, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/jobs/${token}`);
    const data = await res.json();
    if (data.status === 'done' || data.status === 'failed') return data;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('작업이 제한 시간 안에 끝나지 않았습니다.');
}

test('랜딩은 업로드 진입점과 신뢰 3종을 노출한다', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /href="\/upload"/);
  assert.match(html, /평균 절대 오차/);
  assert.match(html, /자동 삭제/);
  assert.match(html, /공식 감정 결과가 아닙니다/);
  // 샘플이 없으면 더미로 채우지 않는다.
  assert.match(html, /SAMPLE_REPORT_TOKEN/);
});

test('업로드 화면은 제약을 업로드 전에 보여준다', async () => {
  const html = await (await fetch(`${base}/upload`)).text();
  assert.match(html, /500MB 이하/);
  assert.match(html, /3분 이하/);
  for (const label of ['사고 분쟁', '보험 청구', '업무·연구', '기타']) assert.ok(html.includes(label));
});

test('정상 업로드는 접수 화면으로 보내고 분석을 끝낸다', async () => {
  const res = await upload({ file: makeMp4({ durationSeconds: 20 }), filename: 'accident.mp4', fields: validFields });
  assert.equal(res.status, 303);
  const token = res.headers.get('location').split('/').pop();

  const jobHtml = await (await fetch(`${base}/jobs/${token}`)).text();
  assert.match(jobHtml, /이 페이지를 닫아도 됩니다|메일로/);
  assert.ok(!/남은 시간|분 남음/.test(jobHtml), '남은 시간 예측은 표시하지 않는다');

  const done = await waitForDone(token);
  assert.equal(done.status, 'done');

  const resultHtml = await (await fetch(`${base}/results/${token}`)).text();
  assert.match(resultHtml, /시간축 속도/);
  assert.match(resultHtml, /감속 구간/);
  assert.match(resultHtml, /공식 감정 결과가 아닙니다/);
  assert.match(resultHtml, /오차/);
  assert.match(resultHtml, /PDF 리포트 내려받기/);
  assert.match(resultHtml, /이 결과가 정확한가요/);
  assert.match(resultHtml, /<polygon/, '오차 범위 음영이 그려져야 한다');
  assert.match(resultHtml, /[0-9a-f]{64}/, '영상 SHA-256 이 표기돼야 한다');
  assert.match(resultHtml, /스텁 어댑터/, '스텁 결과임을 밝혀야 한다');

  const pdf = await fetch(`${base}/results/${token}/report.pdf`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString('latin1'), '%PDF');
  assert.ok(bytes.length > 20_000, `PDF 가 너무 작다 (${bytes.length})`);
});

test('지원하지 않는 확장자는 사유와 해결 경로, 기종 수집 폼을 낸다', async () => {
  const res = await upload({ file: makeNonVideo(), filename: 'clip.avi', fields: validFields });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /지원하지 않는 파일 형식/);
  assert.match(html, /변환/);
  assert.match(html, /블랙박스 기종을 알려주세요/);
});

test('확장자만 mp4 인 파일은 서버가 걸러낸다', async () => {
  const res = await upload({ file: makeNonVideo(), filename: 'fake.mp4', fields: validFields });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /영상 파일을 읽지 못했습니다/);
});

test('길이 초과는 실제 초 수를 알려준다', async () => {
  const res = await upload({ file: makeMp4({ durationSeconds: 400 }), filename: 'long.mp4', fields: validFields });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /영상이 너무 깁니다/);
  assert.match(html, /400초/);
});

test('동의하지 않으면 서버가 거절한다 (클라이언트 검증만 믿지 않는다)', async () => {
  const res = await upload({
    file: makeMp4({ durationSeconds: 10 }), filename: 'ok.mp4',
    fields: { ...validFields, consent: '' },
  });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /동의/);
});

test('이메일 형식이 틀리면 거절한다', async () => {
  const res = await upload({
    file: makeMp4({ durationSeconds: 10 }), filename: 'ok.mp4',
    fields: { ...validFields, email: 'not-an-email' },
  });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /이메일 형식/);
});

test('피드백·검토 신청·기종 제보가 기록된다', async () => {
  const res = await upload({ file: makeMp4({ durationSeconds: 15 }), filename: 'fb.mp4', fields: validFields });
  const token = res.headers.get('location').split('/').pop();
  await waitForDone(token);

  const post = (url, body) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  assert.equal((await post(`/api/results/${token}/feedback`, { isAccurate: false, actualKmh: 52.5, note: '더 빨랐음' })).status, 200);
  assert.equal((await post(`/api/results/${token}/paywall-open`, {})).status, 204);
  assert.equal((await post(`/api/results/${token}/review-interest`, { email: 'buyer@example.com' })).status, 200);
  assert.equal((await post(`/api/results/${token}/review-interest`, { email: 'nope' })).status, 400);
  assert.equal((await post('/api/device-reports', { device: '아이나비 QXD7000', failureCode: 'DURATION_UNKNOWN' })).status, 200);
  assert.equal((await post('/api/device-reports', { device: '' })).status, 400);

  const { db } = await import('../src/db.js');
  const names = db.prepare('SELECT DISTINCT name FROM events').all().map((r) => r.name);
  for (const expected of [
    'landing_view', 'upload_complete', 'job_started', 'result_view',
    'pdf_download', 'paywall_click', 'accuracy_feedback', 'unsupported_file', 'device_report_submit',
  ]) {
    assert.ok(names.includes(expected), `${expected} 이벤트가 기록되지 않았다`);
  }
  const fb = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 1').get();
  assert.equal(fb.is_accurate, 0);
  assert.equal(fb.actual_kmh, 52.5);
});

test('알 수 없는 토큰은 404 를 낸다', async () => {
  assert.equal((await fetch(`${base}/results/nope`)).status, 404);
  assert.equal((await fetch(`${base}/api/jobs/nope`)).status, 404);
});

test('보관 기간이 지난 영상은 삭제되고 결과는 남는다', async () => {
  const res = await upload({ file: makeMp4({ durationSeconds: 12 }), filename: 'old.mp4', fields: validFields });
  const token = res.headers.get('location').split('/').pop();
  await waitForDone(token);

  const { db } = await import('../src/db.js');
  const past = new Date(Date.now() - 999 * 3600 * 1000).toISOString();
  db.prepare('UPDATE jobs SET created_at = ? WHERE token = ?').run(past, token);

  const { sweepExpiredVideos } = await import('../src/storage.js');
  assert.ok((await sweepExpiredVideos()) >= 1);

  const row = db.prepare('SELECT * FROM jobs WHERE token = ?').get(token);
  assert.equal(row.video_path, null);
  assert.ok(row.video_deleted_at);
  assert.ok(row.sha256);
  assert.equal((await fetch(`${base}/results/${token}`)).status, 200);
});
