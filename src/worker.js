/**
 * 워커 — 업로드와 처리를 분리하는 지점 (브리프 §4).
 *
 * 영상 처리는 수십 초~수 분이므로 요청-응답에 묶지 않는다.
 * 큐는 jobs 테이블이 그대로 맡는다. 초기 물량에서 별도 큐 서버는 과하다.
 */
import fsp from 'node:fs/promises';
import { config } from './config.js';
import { jobs, now } from './db.js';
import { track, EVENT } from './analytics.js';
import { estimateSpeed } from './model/index.js';
import { buildReport } from './analysis.js';
import { extractFrames } from './video/frames.js';
import { framesDir } from './storage.js';
import { sendResultMail, sendFailureMail } from './mailer.js';
import { AnalysisError } from './failures.js';

let running = 0;
let timer = null;
let stopped = false;

export function startWorker() {
  requeueStale();
  const tick = () => {
    if (stopped) return;
    while (running < config.worker.concurrency) {
      const job = jobs.claimNext.get();
      if (!job) break;
      const claimed = jobs.markRunning.run(now(), job.id);
      if (claimed.changes === 0) break; // 다른 워커가 먼저 가져갔다
      running += 1;
      process_(job).finally(() => { running -= 1; });
    }
  };
  tick();
  timer = setInterval(tick, config.worker.pollIntervalMs);
  timer.unref?.();
  return { stop: () => { stopped = true; clearInterval(timer); } };
}

/** 프로세스가 처리 도중 죽었으면 되살린다. */
function requeueStale() {
  const cutoff = new Date(Date.now() - config.worker.staleAfterMs).toISOString();
  for (const job of jobs.staleRunning.all(cutoff)) {
    if (job.attempts >= config.worker.maxAttempts) {
      fail(job, 'ANALYSIS_FAILED', '처리 중 서버가 중단됐습니다.');
    } else {
      jobs.requeue.run(job.id);
      console.warn('[worker] 중단된 작업 재투입', job.token);
    }
  }
}

async function process_(claimed) {
  const job = jobs.byId.get(claimed.id);
  const startedAt = Date.now();
  track(EVENT.JOB_STARTED, { jobId: job.id, purpose: job.purpose, attempt: job.attempts });

  try {
    if (!job.video_path) throw new AnalysisError('VIDEO_EXPIRED', '원본 영상이 이미 삭제됐습니다.');
    await fsp.access(job.video_path);

    const output = await estimateSpeed(job, job.video_path);
    const report = buildReport(output);
    report.evidence = await extractFrames(job.video_path, report.evidence, framesDir(job.token));
    report.generatedAt = now();
    report.processingSeconds = (Date.now() - startedAt) / 1000;

    jobs.markDone.run(JSON.stringify(report), report.model.version, now(), job.id);
    console.log(`[worker] 완료 ${job.token} (${report.processingSeconds.toFixed(1)}s)`);

    try {
      await sendResultMail(jobs.byId.get(job.id), report);
    } catch (err) {
      // 메일 실패로 결과를 잃지 않는다. 링크는 이미 유효하다.
      console.error('[worker] 결과 메일 실패', job.token, err.message);
    }
  } catch (err) {
    const code = err instanceof AnalysisError ? err.code : err.code ?? 'ANALYSIS_FAILED';
    const message = err.message ?? String(err);
    console.error(`[worker] 실패 ${job.token} [${code}] ${message}`);
    if (job.attempts < config.worker.maxAttempts && code === 'ANALYSIS_FAILED') {
      jobs.requeue.run(job.id); // 일시적 오류는 한 번 더
      return;
    }
    await fail(job, code, message);
  }
}

async function fail(job, code, message) {
  jobs.markFailed.run(code, message, now(), job.id);
  track(EVENT.JOB_FAILED, { jobId: job.id, reason: code, purpose: job.purpose });
  try {
    await sendFailureMail(jobs.byId.get(job.id), code, message);
  } catch (err) {
    console.error('[worker] 실패 메일 발송 실패', job.token, err.message);
  }
}
