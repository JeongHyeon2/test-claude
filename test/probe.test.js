import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readBrand, readDurationSeconds } from '../src/video/probe.js';
import { makeMp4, makeNonVideo } from './helpers/fixture.js';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-'));
const write = async (name, buf) => {
  const p = path.join(tmp, name);
  await fs.writeFile(p, buf);
  return p;
};

test('mvhd 에서 재생 시간을 읽는다', async () => {
  const p = await write('a.mp4', makeMp4({ durationSeconds: 42.5 }));
  assert.equal(await readDurationSeconds(p), 42.5);
});

test('moov 가 mdat 뒤에 있어도 찾는다', async () => {
  const p = await write('b.mp4', makeMp4({ durationSeconds: 12, padBytes: 200_000 }));
  assert.equal(await readDurationSeconds(p), 12);
});

test('mov(QuickTime) 브랜드도 같은 구조로 읽는다', async () => {
  const p = await write('c.mov', makeMp4({ durationSeconds: 7.25, brand: 'qt  ' }));
  assert.equal(await readBrand(p), 'qt');
  assert.equal(await readDurationSeconds(p), 7.25);
});

test('영상이 아니면 브랜드를 못 읽는다', async () => {
  const p = await write('d.mp4', makeNonVideo());
  assert.equal(await readBrand(p), null);
});

test('mvhd 가 없으면 null 을 돌려준다 (임의로 추측하지 않는다)', async () => {
  const p = await write('e.mp4', makeNonVideo());
  assert.equal(await readDurationSeconds(p), null);
});
