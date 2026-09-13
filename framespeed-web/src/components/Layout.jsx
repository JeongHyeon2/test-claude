import React from 'react';

const Mark = () => (
  <span className="rail-mk" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
      <path d="M1 9.5 L4 5.5 L7 7.5 L12 1.5" stroke="#fff" strokeWidth="1.9"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const IcoList = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2 3.5h10M2 7h10M2 10.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
const IcoPlus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function Rail({ seg }) {
  return (
    <aside className="rail">
      <div className="rail-brand"><Mark />FrameSpeed</div>
      <div className="rail-sec">분석</div>
      <nav>
        <a href="#/" className={seg === '' ? 'on' : ''}><IcoList />사건 목록</a>
        <a href="#/new" className={seg === 'new' ? 'on' : ''}><IcoPlus />새 분석 접수</a>
      </nav>
      <div className="rail-foot">
        영상 분석 후 7일 · 결과 90일 보관<br />모델 v1.3.0 · calib-a
      </div>
    </aside>
  );
}

export function TopBar({ title, crumb, children }) {
  return (
    <div className="topbar">
      <h1>{title}</h1>
      {crumb && <span className="crumb">{crumb}</span>}
      <div className="right">{children}</div>
    </div>
  );
}

export function Copy({ text, label = '복사' }) {
  const [hit, setHit] = React.useState(false);
  return (
    <button className="copy" type="button" onClick={() => {
      navigator.clipboard?.writeText(text).then(() => { setHit(true); setTimeout(() => setHit(false), 1200); });
    }}>{hit ? '복사됨' : label}</button>
  );
}
