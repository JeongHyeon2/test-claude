/** 업로드 원본 저장 · 해시 · 보관기간 경과 삭제. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { jobs, now } from './db.js';

const DIRS = {
  uploads: path.join(config.storage.dataDir, 'uploads'),
  frames: path.join(config.storage.dataDir, 'frames'),
  mail: path.join(config.storage.dataDir, 'mail'),
  tmp: path.join(config.storage.dataDir, 'tmp'),
};

for (const dir of Object.values(DIRS)) fs.mkdirSync(dir, { recursive: true });

export const dirs = DIRS;

export const newToken = () => crypto.randomBytes(24).toString('base64url');

export function tmpPath(name = crypto.randomUUID()) {
  return path.join(DIRS.tmp, name);
}

export function uploadPath(token, ext) {
  return path.join(DIRS.uploads, `${token}${ext}`);
}

export function framesDir(token) {
  const dir = path.join(DIRS.frames, token);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 영상 SHA-256. 분석 대상이 바뀌지 않았음을 보이는 장치라
 * 저장 직후 한 번 계산해 두고 이후로는 다시 계산하지 않는다 (브리프 §3 SC-04).
 */
export async function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** 보관 기간이 지난 원본을 지운다. 결과·해시는 남긴다. */
export async function sweepExpiredVideos() {
  const cutoff = new Date(Date.now() - config.storage.retentionHours * 3600 * 1000).toISOString();
  const expired = jobs.expiredVideos.all(cutoff);
  let deleted = 0;
  for (const job of expired) {
    try {
      await fsp.rm(job.video_path, { force: true });
      jobs.markVideoDeleted.run(now(), job.id);
      deleted += 1;
    } catch (err) {
      console.error('[storage] 삭제 실패', job.token, err.message);
    }
  }
  if (deleted) console.log(`[storage] 보관기간 경과 영상 ${deleted}건 삭제`);
  return deleted;
}

export function startRetentionSweeper() {
  const run = () => sweepExpiredVideos().catch((e) => console.error('[storage] sweep', e));
  run();
  const timer = setInterval(run, config.storage.sweepIntervalMs);
  timer.unref?.();
  return timer;
}
