import React, { useRef, useState } from 'react';
import { TopBar, DevNote } from '../components/Layout';
import { n1 } from '../lib/fmt';

const LIMITS = {
  MAX_BYTES: 524288000,
  MAX_DURATION_SEC: 180,
  CONTAINERS: ['mp4', 'mov'],
  MIN_WIDTH: 1280, MIN_HEIGHT: 720,
  PROBE_TIMEOUT_MS: 8000,
};
const CONSENT =
  '업로드한 영상은 속도 분석에만 사용되며, 분석 후 7일 뒤 자동 삭제됩니다. ' +
  '분석 결과는 90일간 보관되고 제3자에게 제공되지 않습니다.';

const mb = (b) => (b / 1048576).toFixed(1);
// 한도를 넘긴 값은 올림해서 적는다. 500.0000001MB 를 "500.0MB — 500MB 이하만"
// 이라고 띄우면 왜 막혔는지 읽는 사람이 알 수 없다.
const mbUp = (b) => (Math.ceil((b / 1048576) * 10) / 10).toFixed(1);
const dur = (s) => `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`;

/** 메타데이터가 끝내 안 오는 브라우저가 있다. 무한 대기 대신 시간을 끊는다. */
function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let done = false;
    const finish = (fn, arg) => {
      if (done) return;
      done = true; clearTimeout(timer); URL.revokeObjectURL(url); fn(arg);
    };
    const timer = setTimeout(() => finish(reject, new Error('영상 정보를 읽지 못했습니다.')), LIMITS.PROBE_TIMEOUT_MS);
    v.preload = 'metadata';
    v.onloadedmetadata = () => finish(resolve, { duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    v.onerror = () => finish(reject, new Error('재생할 수 없는 영상입니다.'));
    v.src = url;
  });
}

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const Mark = ({ s }) => (
  <span className={`pill pill-${s === 'ok' ? 'ok' : s === 'warn' ? 'warn' : 'bad'}`}>
    {s === 'ok' ? '적합' : s === 'warn' ? '주의' : '부적합'}
  </span>
);

export default function NewCase() {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(null);       // { file, meta, sha, checks[] }
  const [fileErr, setFileErr] = useState('');
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [ref, setRef] = useState('');
  const [agree, setAgree] = useState(false);
  const [done, setDone] = useState(null);

  async function accept(file) {
    // 이전 파일의 판정이 남아 있으면 새 파일의 결과로 오해된다. 먼저 지운다.
    setFileErr(''); setF(null); setDone(null); setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!LIMITS.CONTAINERS.includes(ext)) throw new Error(`확장자 .${ext} 는 받지 않습니다. mp4 또는 mov 로 올려 주세요.`);
      if (file.size > LIMITS.MAX_BYTES) throw new Error(`용량 ${mbUp(file.size)}MB — 500MB 이하만 접수됩니다.`);

      const meta = await probeVideo(file);
      if (meta.duration > LIMITS.MAX_DURATION_SEC) {
        throw new Error(`길이 ${dur(meta.duration)} — 3분 이하로 잘라서 올려 주세요.`);
      }
      const lowRes = meta.width < LIMITS.MIN_WIDTH || meta.height < LIMITS.MIN_HEIGHT;
      const sha = await sha256(file);

      setF({
        file, meta, sha,
        checks: [
          ['형식', `.${ext}`, 'ok'],
          ['용량', `${mb(file.size)} MB / 500 MB`, 'ok'],
          ['길이', `${dur(meta.duration)} / 3분`, 'ok'],
          ['해상도', `${meta.width} × ${meta.height}`, lowRes ? 'warn' : 'ok'],
          ['영상 해시', `SHA-256 ${sha.slice(0, 32)}…`, 'ok'],
        ],
        lowRes,
      });
    } catch (e) {
      setFileErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e) {
    e.preventDefault();
    if (!f) { setFileErr('접수할 영상을 올려 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailErr('메일 주소 형식을 확인해 주세요.'); return; }
    setEmailErr('');
    setDone({ ...f, email, ref });
  }

  if (done) {
    return (
      <>
        <TopBar title="새 분석 접수" crumb="접수 직전 확인">
          <button className="btn btn-sm" onClick={() => { setDone(null); setF(null); setEmail(''); setRef(''); setAgree(false); }}>
            다른 영상 접수
          </button>
        </TopBar>
        <div className="body">
          <div className="note note-info" style={{ marginBottom: 16 }}>
            브라우저에서 할 수 있는 검사는 모두 마쳤습니다. 실제 접수는 서버가 처리합니다.
          </div>
          <div className="panel" style={{ maxWidth: 620 }}>
            <div className="panel-hd"><h2>접수 내용</h2></div>
            <div className="panel-bd" style={{ paddingTop: 4, paddingBottom: 4 }}>
              <dl className="kv">
                <dt>영상 파일</dt><dd>{done.file.name}</dd>
                <dt>길이 · 용량</dt><dd className="num">{dur(done.meta.duration)} · {mb(done.file.size)} MB</dd>
                <dt>해상도</dt><dd className="num">{done.meta.width} × {done.meta.height}</dd>
                <dt>영상 해시</dt><dd className="mono">SHA-256 {done.sha}</dd>
                <dt>사건 메모</dt><dd>{done.ref || '—'}</dd>
                <dt>결과 수신</dt><dd>{done.email}</dd>
              </dl>
            </div>
          </div>
          <DevNote>
            확장자 · 용량 · 길이 · 해상도 · 영상 해시 검사는 <b>실제로 수행했습니다</b>.
            그다음 단계인 접수(<code>POST /api/jobs</code>)는 저장소에 행을 만들고 업로드 주소를 발급하는 일이라
            서버 권한이 필요합니다. 브라우저에 실린 키에는 쓰기 권한이 없습니다.
          </DevNote>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="새 분석 접수" crumb="mp4 · mov / 최대 3분 / 500MB" />
      <div className="body">
        <form onSubmit={submit} style={{ maxWidth: 680 }}>
          <div className="panel">
            <div className="panel-hd"><h2>영상</h2><span className="sub">사고 전후가 모두 담긴 구간</span></div>
            <div className="panel-bd">
              <div
                className={`drop${over ? ' over' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); const x = e.dataTransfer.files[0]; if (x) accept(x); }}
              >
                {busy ? <div className="spin" style={{ margin: '0 auto' }} /> : (
                  <>
                    <div className="t">{f ? f.file.name : '영상을 끌어다 놓거나 클릭해서 선택'}</div>
                    <div className="s">{f
                      ? `${dur(f.meta.duration)} · ${mb(f.file.size)} MB · ${f.meta.width}×${f.meta.height}`
                      : 'mp4 · mov / 최대 3분 / 500MB 이하'}</div>
                  </>
                )}
                <input ref={inputRef} type="file" accept="video/mp4,video/quicktime" hidden
                  onChange={(e) => { const x = e.target.files[0]; if (x) accept(x); e.target.value = ''; }} />
              </div>
              {fileErr && <div className="note note-bad" style={{ marginTop: 10 }}>{fileErr}</div>}
            </div>

            {f && (
              <table className="t">
                <thead><tr><th style={{ width: 90 }}>검사</th><th>결과</th><th className="r" style={{ width: 80 }}>판정</th></tr></thead>
                <tbody>
                  {f.checks.map(([k, v, s]) => (
                    <tr key={k}>
                      <td style={{ color: 'var(--ink-3)' }}>{k}</td>
                      <td className={k === '영상 해시' ? 'mono' : 'num'}>{v}</td>
                      <td className="r"><Mark s={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {f?.lowRes && (
              <div className="panel-bd" style={{ paddingTop: 0 }}>
                <div className="note note-warn">
                  해상도가 {f.meta.width}×{f.meta.height}로 권장값(1280×720)보다 낮습니다.
                  접수는 되지만 오차가 ±{n1(5)}km/h보다 커질 수 있습니다.
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-hd"><h2>접수 정보</h2></div>
            <div className="panel-bd" style={{ display: 'grid', gap: 14 }}>
              <div className="fld">
                <label htmlFor="ref">사건 메모 <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>(선택)</span></label>
                <input id="ref" className="inp" value={ref} placeholder="사건번호나 구분용 메모"
                  onChange={(e) => setRef(e.target.value)} />
                <span className="hint">목록에서 사건을 구분할 때만 쓰입니다.</span>
              </div>
              <div className="fld">
                <label htmlFor="email">결과 수신 메일</label>
                <input id="email" className="inp" type="email" value={email} placeholder="name@company.com"
                  onChange={(e) => { setEmail(e.target.value); setEmailErr(''); }} />
                <span className="hint">분석이 끝나면 조회 번호와 리포트 링크를 이 주소로 보냅니다.</span>
                {emailErr && <span className="bad">{emailErr}</span>}
              </div>
              <label className="chk">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{CONSENT}</span>
              </label>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" type="submit" disabled={!agree}>분석 접수</button>
            <span className="muted">접수 후 약 3분이면 결과가 나옵니다.</span>
          </div>
        </form>
      </div>
    </>
  );
}
