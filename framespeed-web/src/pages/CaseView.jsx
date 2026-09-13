import React, { useEffect, useState } from 'react';
import { fetchReport } from '../api';
import { upsertCase } from '../store';
import SpeedChart, { kindOf } from '../components/SpeedChart';
import { TopBar, Copy } from '../components/Layout';
import { n1, dt, d8 } from '../lib/fmt';
import { downloadExcel } from '../lib/excel';

export default function CaseView({ code }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [xlsx, setXlsx] = useState('');   // '' | 'working' | 'failed'

  async function saveExcel() {
    setXlsx('working');
    try {
      await downloadExcel(d, code);
      setXlsx('');
    } catch {
      setXlsx('failed');
    }
  }

  useEffect(() => {
    let alive = true;
    setD(null); setErr('');
    fetchReport(code)
      .then((x) => {
        if (!alive) return;
        if (!x) { setErr('해당 조회 번호로 등록된 사건이 없습니다. 보관 기간이 지났을 수 있습니다.'); return; }
        setD(x);
        const r = x.result;
        upsertCase({
          code, file_name: x.file_name, analyzed_at: x.analyzed_at,
          band_label: r.band_label, band_low_kmh: r.band_low_kmh, band_high_kmh: r.band_high_kmh,
          max_kmh: r.max_kmh, error_margin_kmh: r.error_margin_kmh, impact_at_sec: r.impact_at_sec,
        });
      })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [code]);

  if (err) {
    return (
      <>
        <TopBar title="사건" crumb={code.slice(0, 22) + '…'} />
        <div className="body"><div className="note note-bad">{err}</div></div>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <TopBar title="사건" />
        <div className="body"><div className="spin c" /></div>
      </>
    );
  }

  const r = d.result;
  // 결과 보관 만료. 분석 시각 + 90일 — 인용 전에 남은 기간을 알아야 한다.
  // 이미 지난 건은 "-123일 남음" 같은 말이 안 되는 표기 대신 만료로 적는다.
  const expires = new Date(new Date(d.analyzed_at).getTime() + 90 * 86400000);
  const daysLeft = Math.ceil((expires - Date.now()) / 86400000);
  const expired = daysLeft <= 0;

  return (
    <>
      <TopBar title={d.file_name} crumb={`분석 완료 ${dt(d.analyzed_at)}`}>
        <button className="btn btn-sm" disabled={xlsx === 'working'} onClick={saveExcel}>
          {xlsx === 'working' ? '만드는 중' : '엑셀 저장'}
        </button>
        <button className="btn btn-sm" onClick={() => window.print()}>PDF 저장 · 인쇄</button>
        <button className="btn btn-primary btn-sm" disabled>전문가 검토 신청</button>
      </TopBar>

      <div className="body">
        {xlsx === 'failed' && (
          <div className="note note-bad" style={{ marginBottom: 16 }}>
            엑셀 파일을 만들지 못했습니다. 다시 눌러 주세요.
          </div>
        )}
        <div className="print-head">
          <div className="ph-title">속도 분석 리포트</div>
          <div className="ph-file">{d.file_name}</div>
          <table className="ph-meta">
            <tbody>
              <tr><th>조회 번호</th><td>{code}</td><th>분석 완료</th><td>{dt(d.analyzed_at)}</td></tr>
              <tr><th>영상 해시</th><td colSpan={3}>SHA-256 {d.sha256}</td></tr>
              <tr><th>모델</th><td>{r.model_version || '—'}</td><th>보관 만료</th>
                  <td>{d8(expires.toISOString())}{expired ? ' (만료)' : ` (${daysLeft}일 남음)`}</td></tr>
            </tbody>
          </table>
        </div>
        {expired && (
          <div className="note note-bad" style={{ marginBottom: 16 }}>
            보관 기간(분석 후 90일)이 지난 결과입니다. 원본 영상과 근거 프레임은 이미 삭제되었고,
            재분석이 필요하면 영상을 다시 접수해야 합니다.
          </div>
        )}
        <div className="grid-2">
          <div>
            <div className="panel">
              <div className="verdict">
                <div className="v-main">
                  <div className="l">추정 속도 구간</div>
                  <div className="v">{r.band_label}<span>{n1(r.band_low_kmh)} – {n1(r.band_high_kmh)} km/h</span></div>
                </div>
                <div className="v-cols">
                  <div className="v-col"><div className="l">평균</div><div className="v">{n1(r.avg_kmh)}<small>km/h</small></div></div>
                  <div className="v-col"><div className="l">최고</div><div className="v">{n1(r.max_kmh)}<small>km/h</small></div></div>
                  <div className="v-col"><div className="l">최대 감속</div><div className="v">{n1(r.peak_decel_kmh_s)}<small>km/h·s</small></div></div>
                  <div className="v-col"><div className="l">충돌 추정</div><div className="v">{n1(r.impact_at_sec)}<small>초</small></div></div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>시간축 속도</h2>
                <span className="sub">
                  0 – {n1(r.impact_at_sec)}초
                  <span className="print-hide"> · 그래프에 마우스를 올리면 해당 시점 값</span>
                </span>
              </div>
              <SpeedChart
                series={r.series} segments={d.segments} margin={r.error_margin_kmh}
                impactAt={r.impact_at_sec} peakDecelAt={r.peak_decel_at_sec} height={300}
              />
            </div>

            {d.segments?.length > 0 && (
              <div className="panel">
                <div className="panel-hd"><h2>구간</h2><span className="sub">{d.segments.length}개</span></div>
                <table className="t">
                  <thead>
                    <tr><th style={{ width: 70 }}>구분</th><th>시간</th><th className="r">속도 변화</th><th className="r">변화율</th></tr>
                  </thead>
                  <tbody>
                    {d.segments.map((s) => {
                      const k = kindOf(s.kind);
                      return (
                        <tr key={s.id || s.seq}>
                          <td><span className={`chip ${k.cls}`}>{k.label}</span></td>
                          <td className="num">{n1(s.start_sec)} – {n1(s.end_sec)}초</td>
                          <td className="r num">{s.delta_kmh > 0 ? '+' : ''}{n1(s.delta_kmh)} km/h</td>
                          <td className="r num">{s.rate_kmh_per_sec > 0 ? '+' : ''}{n1(s.rate_kmh_per_sec)} km/h·s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {d.frames?.length > 0 && (
              <div className="panel">
                <div className="panel-hd"><h2>근거 프레임</h2><span className="sub">{d.frames.length}장</span></div>
                <table className="t">
                  <thead><tr><th style={{ width: 70 }}>번호</th><th>영상 시각</th><th className="r print-hide">보기</th></tr></thead>
                  <tbody>
                    {d.frames.map((f) => (
                      <tr key={f.id || f.seq}>
                        <td className="num">{String(f.seq).padStart(2, '0')}</td>
                        <td className="num">{n1(f.timestamp_sec)}초</td>
                        <td className="r print-hide"><button className="btn btn-sm" disabled>이미지</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="panel print-hide">
              <div className="panel-hd"><h2>사건 정보</h2></div>
              <div className="panel-bd" style={{ paddingTop: 4, paddingBottom: 4 }}>
                <dl className="kv">
                  <dt>영상 파일</dt><dd>{d.file_name}</dd>
                  <dt>조회 번호</dt><dd className="mono">{code}<Copy text={code} /></dd>
                  <dt>영상 해시</dt><dd className="mono">SHA-256 {d.sha256}<Copy text={d.sha256} /></dd>
                  <dt>분석 완료</dt><dd className="num">{dt(d.analyzed_at)}</dd>
                  <dt>모델</dt><dd className="mono">{r.model_version || '—'}</dd>
                  <dt>보관 만료</dt>
                  <dd className="num">
                    {d8(expires.toISOString())}{' '}
                    <span className={`pill ${expired ? 'pill-bad' : daysLeft <= 14 ? 'pill-warn' : 'pill-idle'}`}>
                      {expired ? '만료' : `${daysLeft}일 남음`}
                    </span>
                  </dd>
                </dl>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd"><h2>인용 시 확인</h2></div>
              <div className="panel-bd" style={{ display: 'grid', gap: 10 }}>
                <div className="note note-warn">
                  이 결과는 영상 기반 자동 추정치로, 공식 감정 결과가 아닙니다.
                  평균 오차는 약 ±{n1(r.error_margin_kmh)}km/h이며 촬영 조건에 따라 달라질 수 있습니다.
                  법적 분쟁의 근거로 사용하기 전에 전문 감정기관의 검토를 권장합니다.
                </div>
                <div className="note note-info">
                  속도를 한 값으로 적지 말고 <b>{n1(r.band_low_kmh)}–{n1(r.band_high_kmh)} km/h</b> 구간으로 인용하세요.
                  영상 해시는 분석한 영상이 제출 영상과 같은 파일인지 확인하는 데 씁니다.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
