import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { jobs, feedback, reviewInterest, deviceReports, now } from './db.js';
import { track, EVENT } from './analytics.js';
import { describeFailure } from './failures.js';
import { receiveUpload, UploadRejection } from './upload-handler.js';
import { landingPage, uploadPage, jobPage, resultPage, failurePage, notFoundPage } from './views/pages.js';
import { buildReportPdf } from './report/pdf.js';
import { dirs } from './storage.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));
  app.use(express.json({ limit: '64kb' }));
  app.use(express.static(path.join(config.root, 'public'), { maxAge: '1h' }));

  const readReport = (job) => (job.result_json ? JSON.parse(job.result_json) : null);

  const findJob = (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) {
      res.status(404).send(notFoundPage());
      return null;
    }
    return job;
  };

  /* ── SC-01 랜딩 ─────────────────────────────────────────── */
  app.get('/', (req, res) => {
    track(EVENT.LANDING_VIEW, { ref: req.get('referer') ?? null });
    let sample = null;
    if (config.sampleReportToken) {
      const job = jobs.byToken.get(config.sampleReportToken);
      if (job?.status === 'done') sample = { token: job.token, summary: readReport(job).summary };
      else console.warn('[landing] SAMPLE_REPORT_TOKEN 이 완료된 분석을 가리키지 않습니다.');
    }
    res.send(landingPage({ sample }));
  });

  /* ── SC-02 업로드 ───────────────────────────────────────── */
  app.get('/upload', (_req, res) => res.send(uploadPage()));

  app.post('/upload', async (req, res) => {
    let received;
    try {
      received = await receiveUpload(req);
    } catch (err) {
      if (!(err instanceof UploadRejection)) throw err;
      const failure = describeFailure(err.code, err.ctx);
      track(EVENT.UNSUPPORTED_FILE, { reason: err.code, ...err.ctx });
      return res.status(400).send(failurePage(failure, { email: err.ctx.email ?? '' }));
    }

    jobs.create.run(
      received.token, received.email, received.purpose, received.filename,
      received.sizeBytes, received.durationSeconds, received.sha256, received.filePath, now(),
    );
    const job = jobs.byToken.get(received.token);
    track(EVENT.UPLOAD_COMPLETE, {
      jobId: job.id, purpose: job.purpose,
      sizeBytes: job.size_bytes, durationSeconds: job.duration_s,
    });
    res.redirect(303, `/jobs/${job.token}`);
  });

  /* ── SC-03 접수 완료 ────────────────────────────────────── */
  app.get('/jobs/:token', (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    if (job.status === 'done') return res.redirect(302, `/results/${job.token}`);
    if (job.status === 'failed') {
      return res.status(200).send(failurePage(
        describeFailure(job.failure_code, { message: job.failure_message }),
        { token: job.token, email: job.email },
      ));
    }
    res.send(jobPage(job));
  });

  /** SC-03 폴링. 남은 시간은 내려보내지 않는다 — 틀린 예측은 그 자체로 신뢰를 깎는다. */
  app.get('/api/jobs/:token', (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) return res.status(404).json({ error: 'not_found' });
    res.json({
      status: job.status,
      resultUrl: job.status === 'done' ? `/results/${job.token}` : null,
      failure: job.status === 'failed'
        ? describeFailure(job.failure_code, { message: job.failure_message })
        : null,
    });
  });

  /* ── SC-04 결과 ★ ───────────────────────────────────────── */
  app.get('/results/:token', (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    if (job.status === 'failed') {
      return res.status(200).send(failurePage(
        describeFailure(job.failure_code, { message: job.failure_message }),
        { token: job.token, email: job.email },
      ));
    }
    if (job.status !== 'done') return res.redirect(302, `/jobs/${job.token}`);
    track(EVENT.RESULT_VIEW, { jobId: job.id, purpose: job.purpose });
    res.send(resultPage(job, readReport(job), { feedback: feedback.forJob.get(job.id) ?? null }));
  });

  app.get('/results/:token/report.pdf', (req, res) => {
    const job = findJob(req, res);
    if (!job) return;
    if (job.status !== 'done') return res.redirect(302, `/jobs/${job.token}`);
    track(EVENT.PDF_DOWNLOAD, { jobId: job.id, purpose: job.purpose });
    const filename = `speed-report-${job.sha256.slice(0, 12)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const doc = buildReportPdf(job, readReport(job), path.join(dirs.frames, job.token));
    doc.pipe(res);
  });

  app.get('/results/:token/frames/:file', (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) return res.status(404).end();
    if (!/^frame-\d{2}\.jpg$/.test(req.params.file)) return res.status(400).end();
    const file = path.join(dirs.frames, job.token, req.params.file);
    if (!fs.existsSync(file)) return res.status(404).end();
    res.sendFile(file);
  });

  /** 정확도 피드백 — 실사용 영상에서 모델을 검증할 유일한 경로 (브리프 §3). */
  app.post('/api/results/:token/feedback', (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const isAccurate = req.body.isAccurate === true || req.body.isAccurate === 'true';
    const actual = Number.parseFloat(req.body.actualKmh);
    feedback.insert.run(
      job.id, isAccurate ? 1 : 0,
      Number.isFinite(actual) ? actual : null,
      (req.body.note ?? '').slice(0, 1000), now(),
    );
    track(EVENT.ACCURACY_FEEDBACK, {
      jobId: job.id, isAccurate, hasActual: Number.isFinite(actual), purpose: job.purpose,
    });
    res.json({ ok: true });
  });

  /* ── SC-05 전문가 검토 (fake door) ──────────────────────── */
  /** 버튼 클릭 자체가 가격에 대한 첫 데이터다. 이메일을 남기지 않아도 기록한다. */
  app.post('/api/results/:token/paywall-open', (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) return res.status(404).json({ error: 'not_found' });
    track(EVENT.PAYWALL_CLICK, { jobId: job.id, purpose: job.purpose, converted: false });
    res.status(204).end();
  });

  app.post('/api/results/:token/review-interest', (req, res) => {
    const job = jobs.byToken.get(req.params.token);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const email = String(req.body.email ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'invalid_email' });
    }
    reviewInterest.insert.run(job.id, email, now());
    track(EVENT.PAYWALL_CLICK, { jobId: job.id, purpose: job.purpose, converted: true });
    res.json({ ok: true });
  });

  /* ── SC-06 기종 수집 ────────────────────────────────────── */
  app.post('/api/device-reports', (req, res) => {
    const device = String(req.body.device ?? '').trim();
    if (!device) return res.status(400).json({ error: 'device_required' });
    deviceReports.insert.run(
      device.slice(0, 200),
      String(req.body.note ?? '').slice(0, 1000),
      String(req.body.email ?? '').slice(0, 200) || null,
      String(req.body.failureCode ?? '').slice(0, 60) || null,
      now(),
    );
    track(EVENT.DEVICE_REPORT_SUBMIT, { failureCode: req.body.failureCode ?? null });
    res.json({ ok: true });
  });

  /** 클라이언트에서만 알 수 있는 이벤트. 임의 이름은 받지 않는다. */
  const CLIENT_EVENTS = new Set([EVENT.UPLOAD_START, EVENT.UNSUPPORTED_FILE]);
  app.post('/api/events', (req, res) => {
    const name = String(req.body.name ?? '');
    if (!CLIENT_EVENTS.has(name)) return res.status(400).json({ error: 'unknown_event' });
    const { name: _drop, ...props } = req.body;
    track(name, { source: 'client', ...props });
    res.status(204).end();
  });

  app.use((_req, res) => res.status(404).send(notFoundPage()));

  app.use((err, _req, res, _next) => {
    console.error('[app] 처리되지 않은 오류', err);
    res.status(500).send(failurePage(describeFailure('ANALYSIS_FAILED', { message: '서버에서 요청을 처리하지 못했습니다.' })));
  });

  return app;
}
