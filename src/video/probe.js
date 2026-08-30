/**
 * mp4 / mov 재생 시간 추출.
 *
 * ffmpeg 없이 동작해야 한다 (배포 환경에 없을 수 있음).
 * mp4(ISO-BMFF)와 mov(QuickTime)는 같은 atom 구조를 쓰므로
 * moov > mvhd 의 timescale·duration 만 읽으면 된다.
 */
import fs from 'node:fs/promises';

const MAX_SCAN_BYTES = 64 * 1024 * 1024; // moov 가 파일 끝에 있는 경우까지 커버

/** 파일 앞부분에 ftyp 박스가 있는지 확인해 확장자 위조를 거른다. */
export async function readBrand(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    if (bytesRead < 12) return null;
    if (buf.toString('latin1', 4, 8) !== 'ftyp') return null;
    return buf.toString('latin1', 8, 12).trim();
  } finally {
    await fh.close();
  }
}

/** @returns {Promise<number|null>} 초 단위 재생 시간. 파싱 실패 시 null. */
export async function readDurationSeconds(filePath) {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const mvhd = await findBox(fh, 0, size, ['moov', 'mvhd'], 0);
    if (!mvhd) return null;
    const buf = Buffer.alloc(Math.min(32, mvhd.size - 8));
    await fh.read(buf, 0, buf.length, mvhd.contentStart);
    const version = buf.readUInt8(0);
    if (version === 1) {
      if (buf.length < 28) return null;
      const timescale = buf.readUInt32BE(20);
      const duration = Number(buf.readBigUInt64BE(24));
      return timescale > 0 ? duration / timescale : null;
    }
    if (buf.length < 20) return null;
    const timescale = buf.readUInt32BE(12);
    const duration = buf.readUInt32BE(16);
    return timescale > 0 ? duration / timescale : null;
  } catch {
    return null;
  } finally {
    await fh.close();
  }
}

/** 중첩 atom 경로를 따라 내려간다. */
async function findBox(fh, start, end, pathParts, depth) {
  const [want, ...rest] = pathParts;
  let offset = start;
  const header = Buffer.alloc(16);
  while (offset + 8 <= end && offset - start < MAX_SCAN_BYTES) {
    const { bytesRead } = await fh.read(header, 0, 16, offset);
    if (bytesRead < 8) return null;
    let size = header.readUInt32BE(0);
    const type = header.toString('latin1', 4, 8);
    let headerSize = 8;
    if (size === 1) {
      if (bytesRead < 16) return null;
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset; // 파일 끝까지
    }
    if (size < headerSize) return null;
    if (type === want) {
      const contentStart = offset + headerSize;
      if (rest.length === 0) return { start: offset, size, contentStart };
      return findBox(fh, contentStart, offset + size, rest, depth + 1);
    }
    offset += size;
  }
  return null;
}
