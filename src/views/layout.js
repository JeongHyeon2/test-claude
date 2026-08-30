import { config } from '../config.js';

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const html = (strings, ...values) =>
  strings.reduce((acc, s, i) => acc + s + (i < values.length ? render(values[i]) : ''), '');

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(render).join('');
  if (typeof v === 'object' && v.__raw) return v.__raw;
  return esc(v);
}

export const raw = (s) => ({ __raw: s });

export function page({ title, description = '', body, bodyClass = '', head = '' }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(config.serviceName)}</title>
<meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="/styles.css">
${head}
</head>
<body class="${esc(bodyClass)}">
<header class="site-head">
  <a class="wordmark" href="/">${esc(config.serviceName)}</a>
  <span class="wordmark-note">영상 기반 자차 속도 추정 · 참고용</span>
</header>
<main>${body}</main>
<footer class="site-foot">
  <p>${esc(config.serviceName)} — 공식 감정 결과가 아닌 참고 자료입니다.</p>
  <p class="mono">문의 ${esc(config.supportEmail)}</p>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}
