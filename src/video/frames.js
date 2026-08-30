/**
 * 근거 프레임 추출.
 *
 * ffmpeg 가 있으면 실제 프레임을 뽑는다. 없으면 자리표시자로 표기한다 —
 * 화면과 PDF 양쪽에서 "프레임 없음"임을 분명히 밝힌다. 없는 근거를 그럴듯하게 그리지 않는다.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

const run = promisify(execFile);
let ffmpegAvailable = null;

export async function hasFfmpeg() {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await run(config.evidenceFrames.ffmpegPath, ['-version'], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    console.warn('[frames] ffmpeg 없음 — 근거 프레임은 자리표시자로 표기됩니다.');
  }
  return ffmpegAvailable;
}

export async function extractFrames(videoPath, picks, outDir) {
  const ok = videoPath && fs.existsSync(videoPath) && (await hasFfmpeg());
  const out = [];
  for (const [i, pick] of picks.entries()) {
    const name = `frame-${String(i).padStart(2, '0')}.jpg`;
    const dest = path.join(outDir, name);
    if (!ok) {
      out.push({ ...pick, file: null, placeholder: true });
      continue;
    }
    try {
      await run(config.evidenceFrames.ffmpegPath, [
        '-ss', String(pick.t), '-i', videoPath,
        '-frames:v', '1', '-q:v', '4', '-vf', 'scale=640:-1', '-y', dest,
      ], { timeout: 30_000 });
      out.push({ ...pick, file: name, placeholder: false });
    } catch (err) {
      console.error('[frames] 추출 실패', pick.t, err.message);
      out.push({ ...pick, file: null, placeholder: true });
    }
  }
  return out;
}
