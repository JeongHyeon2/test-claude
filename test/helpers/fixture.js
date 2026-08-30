/**
 * 테스트용 최소 mp4 생성.
 * ffmpeg 없이도 검증 경로(ftyp 확인 + mvhd 재생시간 파싱)를 그대로 태울 수 있게,
 * 실제 파일과 같은 atom 구조만 갖춘 파일을 만든다.
 */
import { Buffer } from 'node:buffer';

function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, payload]);
}

export function makeMp4({ durationSeconds = 30, timescale = 1000, padBytes = 0, brand = 'isom' } = {}) {
  const ftyp = box('ftyp', Buffer.concat([
    Buffer.from(brand, 'latin1'),
    Buffer.from([0, 0, 2, 0]),
    Buffer.from('isomiso2avc1mp41', 'latin1'),
  ]));

  const mvhdPayload = Buffer.alloc(100);
  mvhdPayload.writeUInt8(0, 0); // version 0
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(Math.round(durationSeconds * timescale), 16);
  const moov = box('moov', box('mvhd', mvhdPayload));

  const mdat = box('mdat', Buffer.alloc(padBytes));
  return Buffer.concat([ftyp, mdat, moov]);
}

export function makeNonVideo(size = 2048) {
  return Buffer.concat([Buffer.from('NOTAVIDEO', 'latin1'), Buffer.alloc(size)]);
}
