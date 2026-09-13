import React, { useEffect, useState } from 'react';
import { fetchReport } from '../api';
import { listCases, upsertCase, removeCase, SAMPLE_CODE } from '../store';
import { TopBar, DevNote } from '../components/Layout';
import { n1, dt, d8 } from '../lib/fmt';

/** 표에 쓸 한 줄만 뽑는다. 사건 내용은 브라우저에 남기지 않는다. */
function summarize(code, d) {
  const r = d.result;
  return {
    code,
    file_name: d.file_name,
    analyzed_at: d.analyzed_at,
    band_label: r.band_label,
    band_low_kmh: r.band_low_kmh,
    band_high_kmh: r.band_high_kmh,
    max_kmh: r.max_kmh,
    error_margin_kmh: r.error_margin_kmh,
    impact_at_sec: r.impact_at_sec,
  };
}

export default function Cases() {
  const [rows, setRows] = useState(() => listCases());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  // 예시 사건은 요약이 비어 있다. 표가 빈칸으로 시작하지 않게 한 번 채워 둔다.
  useEffect(() => {
    const stub = rows.find((r) => r.sample && !r.file_name);
    if (!stub) return;
    let alive = true;
    fetchReport(stub.code).then((d) => {
      if (!alive || !d) return;
      setRows((cur) => cur.map((r) => (r.code === stub.code ? { ...summarize(stub.code, d), sample: true } : r)));
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function load(e) {
    e?.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true); setErr('');
    try {
      const d = await fetchReport(c);
      if (!d) { setErr('해당 조회 번호로 등록된 사건이 없습니다. 안내 메일의 번호를 다시 확인해 주세요.'); return; }
      upsertCase(summarize(c, d));
      setRows(listCases());
      setCode('');
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  function drop(c) {
    removeCase(c);
    setRows(listCases());
  }

  const shown = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = `${r.file_name || ''} ${r.code} ${r.band_label || ''}`.toLowerCase();
    return s.includes(q.trim().toLowerCase());
  });

  return (
    <>
      <TopBar title="사건 목록" crumb={`${rows.length}건`}>
        <a className="btn btn-primary btn-sm" href="#/new">새 분석 접수</a>
      </TopBar>

      <div className="body">
        <div className="panel">
          <div className="panel-hd">
            <h2>조회 번호로 불러오기</h2>
            <span className="sub">분석 완료 안내 메일에 적힌 번호</span>
          </div>
          <div className="panel-bd">
            <form className="row" onSubmit={load}>
              <input
                className="inp mono" style={{ maxWidth: 380 }} value={code} placeholder="예) smpl_9f3a71c0be48d2115c7e0a9f4d83b672"
                onChange={(e) => { setCode(e.target.value); setErr(''); }}
              />
              <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>
                {busy ? '불러오는 중' : '불러오기'}
              </button>
              {code.trim() === '' && (
                <button className="btn" type="button" onClick={() => setCode(SAMPLE_CODE)}>예시 번호 넣기</button>
              )}
            </form>
            {err && <div className="note note-bad" style={{ marginTop: 10 }}>{err}</div>}
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>불러온 사건</h2>
            <div className="right">
              <input className="inp" style={{ width: 200 }} placeholder="파일명 · 번호 검색"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="empty">
              <div className="t">{q ? '검색 결과가 없습니다' : '불러온 사건이 없습니다'}</div>
              <div className="s">{q ? '다른 말로 찾아보세요.' : '위에 조회 번호를 넣으면 여기에 쌓입니다.'}</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>영상 파일</th>
                    <th>추정 속도 구간</th>
                    <th className="r">최고</th>
                    <th className="r">오차</th>
                    <th className="r">충돌 시각</th>
                    <th>분석 완료</th>
                    <th style={{ width: 92 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.code} className="click" onClick={() => { window.location.hash = `#/case/${r.code}`; }}>
                      <td>
                        <div style={{ fontWeight: 550 }}>{r.file_name || '—'}</div>
                        <div className="mono" style={{ color: 'var(--ink-3)' }}>{r.code.slice(0, 22)}…</div>
                      </td>
                      <td>
                        <span className="pill pill-ok">{r.band_label || '분석 완료'}</span>
                        {r.band_low_kmh != null && (
                          <span className="num muted" style={{ marginLeft: 8 }}>
                            {n1(r.band_low_kmh)}–{n1(r.band_high_kmh)} km/h
                          </span>
                        )}
                      </td>
                      <td className="r num">{r.max_kmh != null ? `${n1(r.max_kmh)} km/h` : '—'}</td>
                      <td className="r num">{r.error_margin_kmh != null ? `±${n1(r.error_margin_kmh)}` : '—'}</td>
                      <td className="r num">{r.impact_at_sec != null ? `${n1(r.impact_at_sec)}초` : '—'}</td>
                      <td className="num">{r.analyzed_at ? d8(r.analyzed_at) : '—'}</td>
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        {r.sample
                          ? <span className="chip chip-std">예시</span>
                          : <button className="btn btn-sm" onClick={() => drop(r.code)}>목록에서 빼기</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DevNote>
          이 목록은 <b>이 브라우저에만</b> 남습니다. 브라우저에 실린 키로는 사건 표를 통째로 읽을 수 없어(RLS),
          조회 번호로 불러온 사건만 쌓입니다. 계정별 사건 목록은 서버에서 내려줘야 합니다.
        </DevNote>
      </div>
    </>
  );
}
