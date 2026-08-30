/**
 * 업로드 수신 · 서버 재검증.
 *
 * 클라이언트 검증은 이탈을 줄이려고 넣은 것이고, 신뢰하지는 않는다 (브리프 §3 SC-02).
 * 여기서 확장자 / 용량 / 재생시간 / 파일 내부 구조를 다시 본다.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import busboy from 'busboy';
import { config } from './config.js';
import { newToken, uploadPath } from './storage.js';
import { readBrand, readDurationSeconds } from './video/probe.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UploadRejection extends Error {
  constructor(code, ctx = {}) {
    super(code);
    this.code = code;
    this.ctx = ctx;
  }
}

/** @returns {Promise<{token, filePath, ext, filename, sizeBytes, sha256, email, purpose, durationSeconds}>} */
export function receiveUpload(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        // 한글 파일명이 깨지지 않게 multipart 파라미터를 UTF-8 로 읽는다.
        defParamCharset: 'utf8',
        limits: { files: 1, fileSize: config.upload.maxBytes },
      });
    } catch (err) {
      return reject(new UploadRejection('MISSING_FIELD', { message: err.message }));
    }

    const fields = {};
    const token = newToken();
    let filePath = null;
    let filename = null;
    let ext = null;
    let sizeBytes = 0;
    let hash = null;
    let truncated = false;
    let fileDone = null;
    let rejected = null;

    const cleanup = async () => {
      if (filePath) await fsp.rm(filePath, { force: true }).catch(() => {});
    };
    const bail = (err) => {
      if (rejected) return;
      rejected = err;
      req.unpipe(bb);
      cleanup().finally(() => reject(err));
    };

    bb.on('field', (name, value) => { fields[name] = value; });

    bb.on('file', (name, stream, info) => {
      if (name !== 'video') { stream.resume(); return; }
      filename = path.basename(info.filename ?? 'upload');
      ext = path.extname(filename).toLowerCase();
      if (!config.upload.allowedExtensions.includes(ext)) {
        stream.resume();
        return bail(new UploadRejection('EXT_NOT_ALLOWED', { filename }));
      }
      filePath = uploadPath(token, ext);
      hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(filePath);
      fileDone = new Promise((done) => {
        stream.on('data', (chunk) => { sizeBytes += chunk.length; hash.update(chunk); });
        stream.on('limit', () => { truncated = true; });
        out.on('close', done);
        out.on('error', (e) => bail(new UploadRejection('MISSING_FIELD', { message: e.message })));
      });
      stream.pipe(out);
    });

    bb.on('error', (err) => bail(new UploadRejection('MISSING_FIELD', { message: err.message })));

    bb.on('close', async () => {
      if (rejected) return;
      try {
        if (fileDone) await fileDone;
        if (!filePath) throw new UploadRejection('MISSING_FIELD', { message: '영상 파일이 없습니다.' });
        if (truncated) throw new UploadRejection('TOO_LARGE', { sizeBytes: config.upload.maxBytes });
        if (sizeBytes === 0) throw new UploadRejection('NOT_A_VIDEO');

        const email = (fields.email ?? '').trim();
        const purpose = (fields.purpose ?? '').trim();
        if (!EMAIL_RE.test(email)) throw new UploadRejection('MISSING_FIELD', { field: 'email', message: '이메일 형식이 올바르지 않습니다.' });
        if (!config.purposes.some((p) => p.value === purpose)) throw new UploadRejection('MISSING_FIELD', { field: 'purpose', message: '사용 용도를 선택해 주세요.' });
        if (fields.consent !== 'on') throw new UploadRejection('MISSING_FIELD', { field: 'consent', message: '영상 처리 정책에 동의해 주세요.' });

        const brand = await readBrand(filePath);
        if (!brand) throw new UploadRejection('NOT_A_VIDEO', { filename });

        const durationSeconds = await readDurationSeconds(filePath);
        if (durationSeconds === null) throw new UploadRejection('DURATION_UNKNOWN', { filename });
        if (durationSeconds > config.upload.maxDurationSeconds) {
          throw new UploadRejection('TOO_LONG', { durationSeconds });
        }

        resolve({
          token, filePath, ext, filename, sizeBytes, durationSeconds,
          sha256: hash.digest('hex'), email, purpose,
        });
      } catch (err) {
        bail(err instanceof UploadRejection ? err : new UploadRejection('MISSING_FIELD', { message: err.message }));
      }
    });

    req.pipe(bb);
  });
}
