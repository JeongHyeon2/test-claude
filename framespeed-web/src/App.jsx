import React, { useEffect, useState } from 'react';
import { Rail } from './components/Layout';
import Cases from './pages/Cases';
import CaseView from './pages/CaseView';
import NewCase from './pages/NewCase';

/* 해시 라우팅. 정적 호스팅에서 새로고침해도 404 가 나지 않는 가장 단순한 방법이다. */
function parse(hash) {
  const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  return { seg: parts[0] || '', arg: parts[1] ? decodeURIComponent(parts[1]) : '' };
}

export default function App() {
  const [route, setRoute] = useState(() => parse(window.location.hash));

  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [route.seg, route.arg]);

  let page;
  if (route.seg === 'new') page = <NewCase />;
  else if (route.seg === 'case' && route.arg) page = <CaseView code={route.arg} />;
  else page = <Cases />;

  return (
    <div className="app">
      <Rail seg={route.seg} />
      <div className="main">{page}</div>
    </div>
  );
}
