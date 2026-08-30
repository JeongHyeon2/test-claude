import { config, legal } from '../config.js';
import { html, raw, esc, page } from './layout.js';
import { chartSvg } from './chart-svg.js';
import { msToKmh } from '../analysis.js';

const kmh = (ms) => msToKmh(ms).toFixed(1);
const mb = (b) => Math.round(b / 1024 / 1024);
const fmtDate = (iso) =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
const secs = (t) => `${t.toFixed(1)}s`;

const specLine = () =>
  `${config.upload.allowedExtensions.join(' / ')} · ${Math.round(config.upload.maxDurationSeconds / 60)}분 이하 · ${mb(config.upload.maxBytes)}MB 이하`;

/* ── SC-01 랜딩 ──────────────────────────────────────────────
   이 페이지는 방문자를 업로드로 보내는 일만 한다. */
export function landingPage({ sample }) {
  return page({
    title: '블랙박스 영상으로 자차 속도 추정',
    description: '블랙박스 영상만 올리면 시간축 속도와 감속 구간을 추정해 리포트로 드립니다.',
    body: html`
      <section class="hero">
        <h1>블랙박스 영상만으로<br>자차 속도를 추정합니다</h1>
        <p class="lede">GPS나 추가 장비 없이 영상 하나로 시간축 속도와 감속 구간을 뽑아
          리포트로 드립니다. 정식 감정을 의뢰할지 판단하는 사전 스크리닝 용도입니다.</p>
        <div class="actions">
          <a class="btn" href="/upload">영상 올리기</a>
          <span class="mono" style="font-size:.8rem;color:var(--ink-3)">${specLine()}</span>
        </div>
      </section>

      <section class="card">
        <h2>실제 분석 리포트 샘플</h2>
        ${raw(sample ? sampleBlock(sample) : sampleMissingBlock())}
      </section>

      <section class="trust">
        <div class="card">
          <h3>정확도</h3>
          <p>교차 차종 검증 기준 평균 절대 오차 ${config.model.maeMinMs}~${config.model.maeMaxMs} m/s
            (약 ${(config.model.maeMinMs * 3.6).toFixed(1)}~${(config.model.maeMaxMs * 3.6).toFixed(1)} km/h).
            ${config.model.p95ErrorMs
              ? `p95 오차 ${config.model.p95ErrorMs} m/s.`
              : 'p95·최대 오차는 측정 중이며, 확정 전까지 수치로 표기하지 않습니다.'}
            결과에는 항상 오차 범위를 함께 표시합니다.</p>
        </div>
        <div class="card">
          <h3>영상 처리 정책</h3>
          <p>${raw(esc(legal.retentionNote()))}</p>
        </div>
        <div class="card">
          <h3>지원 사양</h3>
          <p class="mono">${specLine()}</p>
          <p style="margin-top:8px">지원 목록에 없는 기종은 업로드 실패 화면에서 알려 주시면
            다음 순서에 반영합니다.</p>
        </div>
      </section>

      <section class="notice notice--legal">
        <p>${legal.disclaimer}</p>
      </section>
    `,
  });
}

function sampleBlock(sample) {
  return html`
    <p>아래는 실제로 업로드된 영상을 분석해 만든 리포트입니다.</p>
    <div class="summary" style="margin:14px 0">
      <div class="stat"><div class="k">평균 속도</div><div class="v">${kmh(sample.summary.avgMs)}<span class="u">km/h</span></div></div>
      <div class="stat"><div class="k">최고 속도</div><div class="v">${kmh(sample.summary.maxMs)}<span class="u">km/h</span></div></div>
      <div class="stat stat--accent"><div class="k">감속 구간</div><div class="v">${sample.summary.decelerationCount}<span class="u">건</span></div></div>
    </div>
    <div class="actions">
      <a class="btn btn--ghost" href="/results/${sample.token}">샘플 리포트 열기</a>
      <a class="btn btn--quiet btn--sm" href="/results/${sample.token}/report.pdf">PDF 보기</a>
    </div>
  `.trim();
}

/** 샘플이 없으면 만들어 내지 않는다. 랜딩 신뢰의 대부분이 여기서 나오므로 더미는 금지 (브리프 §3). */
function sampleMissingBlock() {
  return html`
    <div class="sample-slot">
      <p><b>샘플 리포트가 아직 연결되지 않았습니다.</b></p>
      <p style="margin:0;color:var(--ink-2);font-size:.88rem">
        실제 영상 1건을 분석한 뒤 그 결과 토큰을 <code class="mono">SAMPLE_REPORT_TOKEN</code>
        환경변수에 넣으면 이 자리에 실제 리포트가 걸립니다.
        더미 데이터로 채우지 않습니다.</p>
    </div>
  `.trim();
}

/* ── SC-02 업로드 ───────────────────────────────────────────── */
export function uploadPage({ errors = {}, values = {} } = {}) {
  return page({
    title: '영상 올리기',
    body: html`
      <h1>영상 올리기</h1>
      <p class="lede">제약을 먼저 확인해 주세요. 올린 뒤 거절되지 않도록 업로드 전에 검사합니다.</p>
      <div class="constraints">
        <span>${config.upload.allowedExtensions.join(' / ')}</span>
        <span>${Math.round(config.upload.maxDurationSeconds / 60)}분 이하</span>
        <span>${mb(config.upload.maxBytes)}MB 이하</span>
      </div>

      <form class="card" id="upload-form" method="post" action="/upload" enctype="multipart/form-data" novalidate>
        <div class="field">
          <label for="video">블랙박스 영상</label>
          <p class="hint">사고 전후 구간만 잘라서 올리면 더 빠르고 정확합니다.</p>
          <input type="file" id="video" name="video" accept=".mp4,.mov,video/mp4,video/quicktime" required>
          <p class="error" id="err-video">${errors.video ?? ''}</p>
        </div>

        <div class="field">
          <label for="email">결과를 받을 이메일</label>
          <p class="hint">분석이 끝나면 결과 링크를 보내드립니다. 별도 가입은 없습니다.</p>
          <input type="email" id="email" name="email" value="${values.email ?? ''}"
                 placeholder="name@example.com" autocomplete="email" required>
          <p class="error" id="err-email">${errors.email ?? ''}</p>
        </div>

        <div class="field">
          <label>사용 용도</label>
          <p class="hint">어떤 상황에 쓰시는지에 따라 리포트 형식을 다듬습니다.</p>
          <div class="radios">
            ${config.purposes.map(
              (p) => raw(`<label><input type="radio" name="purpose" value="${esc(p.value)}"
                ${values.purpose === p.value ? 'checked' : ''} required><span>${esc(p.label)}</span></label>`),
            )}
          </div>
          <p class="error" id="err-purpose">${errors.purpose ?? ''}</p>
        </div>

        <div class="field">
          <label class="check">
            <input type="checkbox" id="consent" name="consent" value="on" ${values.consent ? 'checked' : ''}>
            <span>${legal.consentLabel()} <a href="#policy">정책 보기</a></span>
          </label>
          <p class="error" id="err-consent">${errors.consent ?? ''}</p>
        </div>

        <div class="actions">
          <button class="btn" type="submit" id="submit-btn" disabled>분석 시작</button>
          <span class="mono" style="font-size:.8rem;color:var(--ink-3)" id="upload-status"></span>
        </div>
      </form>

      <section class="notice notice--legal" id="policy">
        <p>${raw(esc(legal.retentionNote()))}</p>
        <p>${legal.disclaimer}</p>
      </section>
    `,
    head: `<script>window.__UPLOAD_LIMITS=${JSON.stringify({
      maxBytes: config.upload.maxBytes,
      maxDurationSeconds: config.upload.maxDurationSeconds,
      allowedExtensions: config.upload.allowedExtensions,
    })};</script>`,
  });
}

/* ── SC-03 접수 완료 ────────────────────────────────────────── */
export function jobPage(job) {
  const stage = job.status === 'done' ? 3 : job.status === 'running' ? 2 : 1;
  const steps = ['업로드 완료', '분석 중', '리포트 생성'];
  return page({
    title: '분석 접수됨',
    body: html`
      <h1>분석을 시작했습니다</h1>
      <p class="lede">이 페이지를 닫아도 됩니다. 완료되면 <b>${job.email}</b> 로 결과 링크를 보내드립니다.</p>

      <div class="card" id="job-card" data-token="${job.token}" data-status="${job.status}">
        <div class="progress-bar"><i style="width:${(stage / steps.length) * 100}%"></i></div>
        <ul class="steps">
          ${steps.map((label, i) =>
            raw(`<li class="${i + 1 < stage ? 'is-done' : i + 1 === stage ? 'is-active' : ''}">
              <span class="dot">${i + 1 < stage ? '✓' : i + 1}</span><span>${esc(label)}</span></li>`))}
        </ul>
        <p class="mono" style="margin:18px 0 0;font-size:.8rem;color:var(--ink-3)"
           id="job-note">처리가 끝나면 이 화면이 결과로 바뀝니다.</p>
      </div>

      <div class="card">
        <h2>접수 내역</h2>
        <dl class="meta-grid">
          <dt>파일명</dt><dd>${job.filename}</dd>
          <dt>접수 일시</dt><dd>${fmtDate(job.created_at)}</dd>
          <dt>영상 SHA-256</dt><dd>${job.sha256}</dd>
        </dl>
      </div>
      <p style="font-size:.85rem;color:var(--ink-3)">이 주소는 추측할 수 없는 임의 토큰으로 만들어집니다.
        링크를 가진 사람만 결과를 볼 수 있으니 공유에 주의해 주세요.</p>
    `,
  });
}

/* ── SC-04 결과 ★ ───────────────────────────────────────────── */
export function resultPage(job, report, { feedback } = {}) {
  const d = report.summary.strongestDeceleration;
  return page({
    title: '속도 분석 결과',
    body: html`
      <h1>속도 분석 결과</h1>

      ${report.model.stub
        ? raw(`<div class="notice notice--warn"><p><b>스텁 어댑터로 생성된 결과입니다.</b>
            영상 내용을 분석하지 않은 값이므로 어떤 판단에도 쓰지 마세요.
            실제 모델은 <code class="mono">MODEL_ADAPTER=command</code> 로 연결합니다.</p></div>`)
        : ''}

      <section class="card">
        <h2>분석 대상</h2>
        <dl class="meta-grid">
          <dt>파일명</dt><dd>${job.filename}</dd>
          <dt>분석 일시</dt><dd>${fmtDate(job.finished_at ?? job.created_at)}</dd>
          <dt>영상 길이</dt><dd>${(job.duration_s ?? 0).toFixed(1)}초</dd>
          <dt>영상 SHA-256</dt><dd>${job.sha256}</dd>
          <dt>모델 버전</dt><dd>${report.model.version}</dd>
        </dl>
        <p style="margin:12px 0 0;font-size:.8rem;color:var(--ink-3)">
          해시는 업로드 직후 원본에서 계산한 값입니다. 같은 해시면 같은 영상을 분석한 결과입니다.</p>
      </section>

      <section class="card">
        <h2>시간축 속도</h2>
        <div class="chart-wrap">${raw(chartSvg(report))}</div>
        <div class="legend">
          <span><i style="background:#2b3ce8"></i>추정 속도</span>
          <span><i style="background:#2b3ce8;opacity:.3"></i>오차 범위</span>
          <span><i style="background:#ff7a6b;opacity:.5"></i>감속 구간</span>
        </div>
      </section>

      <section class="card">
        <h2>요약</h2>
        <div class="summary">
          <div class="stat">
            <div class="k">평균 속도</div>
            <div class="v">${kmh(report.summary.avgMs)}<span class="u">km/h</span></div>
            <div class="sub">± ${(config.model.maeMaxMs * 3.6).toFixed(1)} km/h</div>
          </div>
          <div class="stat">
            <div class="k">최고 속도</div>
            <div class="v">${kmh(report.summary.maxMs)}<span class="u">km/h</span></div>
            <div class="sub">${secs(report.summary.maxAtT)} 지점</div>
          </div>
          <div class="stat stat--accent">
            <div class="k">감속 구간</div>
            <div class="v">${report.summary.decelerationCount}<span class="u">건</span></div>
            <div class="sub">${d ? `최대 ${d.rateMs2.toFixed(1)} m/s²` : '기준 이상 감속 없음'}</div>
          </div>
        </div>
        ${d
          ? raw(`<p style="margin:14px 0 0;font-size:.9rem;color:var(--ink-2)">
              가장 급한 감속은 <b class="mono">${secs(d.startT)}~${secs(d.endT)}</b> 구간으로,
              <b class="mono">${kmh(d.fromMs)} km/h</b> 에서 <b class="mono">${kmh(d.toMs)} km/h</b> 로
              ${d.durationS.toFixed(1)}초에 걸쳐 떨어졌습니다.
              감속량은 두 시점의 차이값이라 절대 속도보다 오차의 영향을 덜 받습니다.</p>`)
          : raw(`<p style="margin:14px 0 0;font-size:.9rem;color:var(--ink-2)">
              설정된 임계값(${config.deceleration.minRateMs2} m/s² 이상,
              ${(config.deceleration.minDropMs * 3.6).toFixed(0)} km/h 이상 감소) 을 넘는 구간이 없습니다.</p>`)}
      </section>

      ${report.decelerations.length
        ? raw(`<section class="card"><h2>감속 구간 상세</h2>
            <table><thead><tr><th>구간</th><th>시작</th><th>종료</th><th>감소</th><th>감속도</th></tr></thead>
            <tbody>${report.decelerations.map((x) => `<tr>
              <td class="mono">${secs(x.startT)}–${secs(x.endT)}</td>
              <td>${kmh(x.fromMs)}</td><td>${kmh(x.toMs)}</td>
              <td>${(x.dropMs * 3.6).toFixed(1)}</td><td>${x.rateMs2.toFixed(2)}</td>
            </tr>`).join('')}</tbody></table>
            <p style="margin:10px 0 0;font-size:.78rem;color:var(--ink-3)">속도 km/h · 감속도 m/s²</p>
            </section>`)
        : ''}

      <section class="card">
        <h2>근거 프레임</h2>
        <p style="font-size:.88rem;color:var(--ink-2)">숫자가 어느 장면에서 나왔는지 확인하는 자리입니다.</p>
        <div class="frames">
          ${report.evidence.map((f) => raw(`<figure class="frame">
            ${f.file
              ? `<img src="/results/${esc(job.token)}/frames/${esc(f.file)}" alt="${esc(f.label)} 프레임" loading="lazy">`
              : `<div class="placeholder">프레임 이미지 없음<br>(서버에 ffmpeg 미설치)</div>`}
            <figcaption><b>${secs(f.t)}</b> · ${esc(f.label)}</figcaption>
          </figure>`))}
        </div>
      </section>

      <section class="notice notice--legal">
        <p><b>고지</b> ${legal.disclaimer}</p>
        <p>${legal.accuracyNote}</p>
      </section>

      <section class="card">
        <h2>리포트 내려받기</h2>
        <p style="font-size:.9rem;color:var(--ink-2)">화면은 확인용입니다. 실제로 들고 나가실 자료는 PDF입니다.</p>
        <div class="actions">
          <a class="btn" href="/results/${job.token}/report.pdf" id="pdf-btn">PDF 리포트 내려받기</a>
          <button class="btn btn--ghost" id="review-btn" type="button">전문가 검토 신청</button>
        </div>
      </section>

      <section class="card" id="feedback-card" data-token="${job.token}">
        <h2>이 결과가 정확한가요?</h2>
        ${feedback
          ? raw(`<p class="mono" style="color:var(--ok)">의견 주셔서 감사합니다. 모델 검증에 사용합니다.</p>`)
          : raw(html`
            <p style="font-size:.88rem;color:var(--ink-2)">실제 속도를 아신다면 알려 주세요.
              실사용 영상에서 모델을 검증할 수 있는 유일한 경로입니다.</p>
            <form id="feedback-form">
              <div class="actions">
                <button class="btn btn--quiet btn--sm" type="button" data-answer="yes">예, 비슷합니다</button>
                <button class="btn btn--quiet btn--sm" type="button" data-answer="no">아니오, 다릅니다</button>
              </div>
              <div class="field hidden" id="actual-field" style="margin-top:16px">
                <label for="actual_kmh">실제 속도 (km/h)</label>
                <input type="number" id="actual_kmh" name="actual_kmh" min="0" max="300" step="0.1" placeholder="예: 52">
                <label for="fb-note" style="margin-top:12px">덧붙일 내용 (선택)</label>
                <textarea id="fb-note" name="note" rows="2" placeholder="어느 구간이 어떻게 달랐는지"></textarea>
                <div class="actions" style="margin-top:12px">
                  <button class="btn btn--sm" type="submit">보내기</button>
                </div>
              </div>
              <p class="mono" id="fb-status" style="font-size:.8rem;color:var(--ok)"></p>
            </form>`)}
      </section>

      <dialog id="review-dialog">
        <h2>전문가 검토 신청</h2>
        <p style="font-size:.9rem;color:var(--ink-2)">준비 중입니다. 출시되면 알려드릴까요?</p>
        <form id="review-form">
          <div class="field">
            <label for="review-email">이메일</label>
            <input type="email" id="review-email" name="email" value="${job.email}" required>
          </div>
          <div class="actions">
            <button class="btn btn--sm" type="submit">알림 받기</button>
            <button class="btn btn--quiet btn--sm" type="button" id="review-close">닫기</button>
          </div>
          <p class="mono" id="review-status" style="font-size:.8rem;color:var(--ok)"></p>
        </form>
      </dialog>
    `,
  });
}

/* ── SC-06 미지원 · 실패 ────────────────────────────────────── */
export function failurePage(failure, { token = null, email = '' } = {}) {
  return page({
    title: '분석할 수 없습니다',
    body: html`
      <h1>${failure.title}</h1>
      <div class="notice notice--danger">
        <p>${failure.detail}</p>
      </div>

      <section class="card">
        <h2>이렇게 하시면 됩니다</h2>
        <ul class="remedies">
          ${failure.remedies.map((r) => raw(`<li>${esc(r)}</li>`))}
        </ul>
        <div class="actions" style="margin-top:14px">
          <a class="btn" href="/upload">다시 올리기</a>
          ${token ? raw(`<a class="btn btn--quiet btn--sm" href="/jobs/${esc(token)}">접수 내역 보기</a>`) : ''}
        </div>
      </section>

      <section class="card" id="device-card" data-failure="${failure.code}">
        <h2>쓰시는 블랙박스 기종을 알려주세요</h2>
        <p style="font-size:.88rem;color:var(--ink-2)">지원 기종을 넓히는 순서를 이 응답으로 정합니다.
          한 줄이면 충분합니다.</p>
        <form id="device-form">
          <div class="field">
            <label for="device">기종 · 모델명</label>
            <input type="text" id="device" name="device" placeholder="예: 아이나비 QXD7000" required>
          </div>
          <div class="field">
            <label for="device-note">덧붙일 내용 (선택)</label>
            <textarea id="device-note" name="note" rows="2" placeholder="파일 확장자, 촬영 설정 등"></textarea>
          </div>
          <div class="field">
            <label for="device-email">연락받을 이메일 (선택)</label>
            <input type="email" id="device-email" name="email" value="${email}">
          </div>
          <div class="actions">
            <button class="btn btn--sm" type="submit">보내기</button>
            <span class="mono" id="device-status" style="font-size:.8rem;color:var(--ok)"></span>
          </div>
        </form>
      </section>
    `,
  });
}

export function notFoundPage() {
  return page({
    title: '찾을 수 없습니다',
    body: html`
      <h1>링크를 찾을 수 없습니다</h1>
      <p class="lede">주소가 잘못됐거나, 결과가 삭제됐을 수 있습니다.</p>
      <div class="actions"><a class="btn" href="/upload">영상 올리기</a></div>
    `,
  });
}
