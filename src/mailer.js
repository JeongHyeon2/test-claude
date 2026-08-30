/**
 * 메일 발송.
 * SMTP_URL 이 없으면 var/mail/*.eml 로 떨군다 — 개발 중에도 문안을 그대로 확인할 수 있다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config, legal } from './config.js';
import { dirs } from './storage.js';
import { describeFailure } from './failures.js';
import { msToKmh } from './analysis.js';

const transport = config.mail.smtpUrl
  ? nodemailer.createTransport(config.mail.smtpUrl)
  : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });

async function send({ to, subject, text }) {
  const info = await transport.sendMail({ from: config.mail.from, to, subject, text });
  if (!config.mail.smtpUrl) {
    const file = path.join(dirs.mail, `${Date.now()}-${to.replace(/[^\w.@-]/g, '_')}.eml`);
    await fs.writeFile(file, info.message);
    console.log(`[mail] SMTP 미설정 — ${file} 에 저장했습니다.`);
  }
  return info;
}

export async function sendResultMail(job, report) {
  const url = `${config.baseUrl}/results/${job.token}`;
  const d = report.summary.strongestDeceleration;
  const lines = [
    `${job.filename} 분석이 끝났습니다.`,
    '',
    `결과 보기: ${url}`,
    `PDF 리포트: ${url}/report.pdf`,
    '',
    '요약',
    `- 평균 속도 ${msToKmh(report.summary.avgMs).toFixed(1)} km/h`,
    `- 최고 속도 ${msToKmh(report.summary.maxMs).toFixed(1)} km/h`,
    `- 감속 구간 ${report.summary.decelerationCount}건` +
      (d ? ` (최대 ${d.rateMs2.toFixed(1)} m/s²)` : ''),
    '',
    `영상 SHA-256: ${job.sha256}`,
    '',
    legal.disclaimer,
    legal.accuracyNote,
    legal.retentionNote(),
  ];
  return send({ to: job.email, subject: `[${config.serviceName}] 속도 분석 결과 — ${job.filename}`, text: lines.join('\n') });
}

/** 실패도 같은 패턴으로 사유를 담아 보낸다 (브리프 §3 SC-06). */
export async function sendFailureMail(job, code, message) {
  const failure = describeFailure(code, { message });
  const lines = [
    `${job.filename} 분석이 완료되지 못했습니다.`,
    '',
    `사유: ${failure.title}`,
    failure.detail,
    '',
    '이렇게 하시면 됩니다',
    ...failure.remedies.map((r) => `- ${r}`),
    '',
    `접수 내역: ${config.baseUrl}/jobs/${job.token}`,
    `영상 SHA-256: ${job.sha256}`,
    '',
    `문의: ${config.supportEmail}`,
  ];
  return send({ to: job.email, subject: `[${config.serviceName}] 분석 실패 — ${job.filename}`, text: lines.join('\n') });
}
