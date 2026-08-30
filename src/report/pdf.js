/**
 * PDF 리포트 — 북극성 지표(pdf_download)의 실체.
 *
 * 화면은 확인용이고 실제로 들고 나가는 건 이 파일이다 (브리프 §3 SC-04).
 * 구성은 브리프가 못박은 여섯 가지: 그래프 / 구간별 속도 / 오차 범위 /
 * 근거 프레임 / 고지 / 영상 해시. 어느 하나도 빼지 않는다.
 */
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { config, legal } from '../config.js';
import { msToKmh } from '../analysis.js';
import { chartGeometry } from './chart.js';

const FONTS = {
  regular: path.join(config.root, 'assets/fonts/Pretendard-Regular.otf'),
  bold: path.join(config.root, 'assets/fonts/Pretendard-SemiBold.otf'),
};

const INK = '#14171c';
const INK_2 = '#4a515c';
const INK_3 = '#7a828e';
const LINE = '#dcdfe5';
const ACCENT = '#2b3ce8';
const CORAL = '#ff7a6b';

const kmh = (ms) => msToKmh(ms).toFixed(1);
const secs = (t) => `${t.toFixed(1)}s`;
const fmtDate = (iso) => new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

/** @returns {PDFDocument} 호출자가 스트림으로 연결한다. */
export function buildReportPdf(job, report, framesDirPath) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, autoFirstPage: false });
  doc.registerFont('kr', FONTS.regular);
  doc.registerFont('kr-b', FONTS.bold);
  doc.addPage();

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;

  const heading = (text) => {
    ensureSpace(doc, 40);
    doc.font('kr-b').fontSize(11).fillColor(INK).text(text, L, doc.y);
    doc.moveDown(0.35);
    doc.strokeColor(LINE).lineWidth(0.7).moveTo(L, doc.y).lineTo(L + W, doc.y).stroke();
    doc.moveDown(0.6);
  };

  // ── 표지 영역 ─────────────────────────────────────────────
  doc.font('kr-b').fontSize(19).fillColor(INK).text('영상 기반 자차 속도 추정 리포트', L, doc.y);
  doc.moveDown(0.2);
  doc.font('kr').fontSize(9).fillColor(INK_3)
    .text(`${config.serviceName} · 생성 ${fmtDate(new Date().toISOString())}`);
  doc.moveDown(1.2);

  if (report.model.stub) {
    box(doc, L, W, '#fdf1e3', '#f0d6b4', [{
      font: 'kr-b', size: 9, color: '#b4530a',
      text: '스텁 어댑터로 생성된 결과입니다. 영상 내용을 분석하지 않은 값이므로 어떤 판단에도 사용하지 마십시오.',
    }]);
    doc.moveDown(0.8);
  }

  // ── 분석 대상 (영상 해시 포함) ─────────────────────────────
  heading('분석 대상');
  kv(doc, L, W, [
    ['파일명', job.filename],
    ['분석 일시', fmtDate(job.finished_at ?? job.created_at)],
    ['영상 길이', `${(job.duration_s ?? 0).toFixed(1)}초`],
    ['파일 크기', `${(job.size_bytes / 1024 / 1024).toFixed(1)} MB`],
    ['영상 SHA-256', job.sha256],
    ['모델 버전', report.model.version],
  ]);
  doc.moveDown(0.3);
  doc.font('kr').fontSize(7.5).fillColor(INK_3)
    .text('해시는 업로드 직후 원본 파일에서 계산한 값입니다. 동일한 해시는 동일한 영상을 분석했음을 뜻합니다.', L, doc.y, { width: W });
  doc.moveDown(1);

  // ── 그래프 (오차 범위 음영 포함) ───────────────────────────
  heading('시간축 속도와 오차 범위');
  ensureSpace(doc, 250);
  // 그리는 동안 doc.y 가 움직이므로, 다음 위치는 시작점 기준으로 잡는다.
  const chartTop = doc.y;
  drawChart(doc, report, L, chartTop, W, 210);
  legendRow(doc, L, chartTop + 216, [
    [ACCENT, 1, '추정 속도'],
    [ACCENT, 0.18, '오차 범위'],
    [CORAL, 0.3, '감속 구간'],
  ]);
  doc.y = chartTop + 238;

  // ── 요약 ────────────────────────────────────────────────
  heading('요약');
  const d = report.summary.strongestDeceleration;
  ensureSpace(doc, 62);
  const statTop = doc.y;
  statRow(doc, L, statTop, W, [
    { k: '평균 속도', v: `${kmh(report.summary.avgMs)} km/h`, s: `± ${(config.model.maeMaxMs * 3.6).toFixed(1)} km/h` },
    { k: '최고 속도', v: `${kmh(report.summary.maxMs)} km/h`, s: `${secs(report.summary.maxAtT)} 지점` },
    { k: '감속 구간', v: `${report.summary.decelerationCount} 건`, s: d ? `최대 ${d.rateMs2.toFixed(1)} m/s²` : '기준 이상 없음' },
  ]);
  doc.y = statTop + 62;
  if (d) {
    doc.font('kr').fontSize(9).fillColor(INK_2).text(
      `가장 급한 감속은 ${secs(d.startT)}~${secs(d.endT)} 구간으로, ${kmh(d.fromMs)} km/h에서 ` +
      `${kmh(d.toMs)} km/h로 ${d.durationS.toFixed(1)}초에 걸쳐 떨어졌습니다. ` +
      `감속량은 두 시점의 차이값이므로 절대 속도보다 오차의 영향을 덜 받습니다.`,
      L, doc.y, { width: W },
    );
    doc.moveDown(1);
  }

  // ── 감속 구간 ───────────────────────────────────────────
  if (report.decelerations.length) {
    heading('감속 구간 상세');
    table(doc, L, W,
      ['구간', '시작(km/h)', '종료(km/h)', '감소(km/h)', '감속도(m/s²)'],
      report.decelerations.map((x) => [
        `${secs(x.startT)}–${secs(x.endT)}`, kmh(x.fromMs), kmh(x.toMs),
        (x.dropMs * 3.6).toFixed(1), x.rateMs2.toFixed(2),
      ]),
      [0.26, 0.185, 0.185, 0.185, 0.185]);
    doc.moveDown(1);
  }

  // ── 구간별 속도 (오차 범위 열 포함) ────────────────────────
  heading('구간별 속도');
  table(doc, L, W,
    ['구간', '평균', '최저', '최고', '오차 범위(km/h)'],
    report.segments.map((s) => [
      `${secs(s.startT)}–${secs(s.endT)}`, kmh(s.avgMs), kmh(s.minMs), kmh(s.maxMs),
      `${kmh(s.loMs)} – ${kmh(s.hiMs)}`,
    ]),
    [0.24, 0.15, 0.15, 0.15, 0.31]);
  doc.moveDown(0.4);
  doc.font('kr').fontSize(7.5).fillColor(INK_3).text('단위 km/h', L, doc.y, { width: W });
  doc.moveDown(1);

  // ── 근거 프레임 ─────────────────────────────────────────
  heading('근거 프레임');
  drawFrames(doc, report, framesDirPath, L, W);

  // ── 고지 ───────────────────────────────────────────────
  ensureSpace(doc, 130);
  heading('고지');
  box(doc, L, W, '#f7f8fa', LINE, [
    { font: 'kr-b', size: 9, color: INK, text: legal.disclaimer, gap: 6 },
    { size: 8.5, color: INK_2, text: legal.accuracyNote, gap: 6 },
    { size: 8.5, color: INK_2, text: legal.retentionNote() },
  ]);

  addFooters(doc, job);
  doc.end();
  return doc;
}

/* ── 그리기 헬퍼 ─────────────────────────────────────────── */

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}

function kv(doc, L, W, rows) {
  const keyW = 90;
  for (const [k, v] of rows) {
    ensureSpace(doc, 18);
    const y = doc.y;
    doc.font('kr').fontSize(8.5).fillColor(INK_3).text(k, L, y, { width: keyW });
    doc.font('kr').fontSize(8.5).fillColor(INK).text(String(v), L + keyW, y, { width: W - keyW });
    doc.y = Math.max(doc.y, y) + 3;
  }
}

/**
 * 배경을 먼저 깔고 그 위에 글을 얹는다.
 * 높이는 heightOfString 으로 미리 재서 구한다 — 시험 삼아 한 번 그려 보면
 * 그 과정에서 쪽이 넘어가 빈 면이 생긴다.
 * @param {{font?: string, size?: number, color?: string, text: string, gap?: number}[]} blocks
 */
function box(doc, L, W, fill, stroke, blocks) {
  const padding = 10;
  const contentW = W - padding * 2;
  let height = padding * 2;
  for (const b of blocks) {
    doc.font(b.font ?? 'kr').fontSize(b.size ?? 9);
    height += doc.heightOfString(b.text, { width: contentW }) + (b.gap ?? 4);
  }
  height -= blocks.at(-1)?.gap ?? 4;

  ensureSpace(doc, height);
  const startY = doc.y;
  doc.save().roundedRect(L, startY, W, height, 5).fillAndStroke(fill, stroke).restore();

  let y = startY + padding;
  for (const b of blocks) {
    doc.font(b.font ?? 'kr').fontSize(b.size ?? 9).fillColor(b.color ?? INK)
      .text(b.text, L + padding, y, { width: contentW });
    y = doc.y + (b.gap ?? 4);
  }
  doc.y = startY + height;
}

function statRow(doc, L, y, W, stats) {
  const gap = 10;
  const w = (W - gap * (stats.length - 1)) / stats.length;
  stats.forEach((s, i) => {
    const x = L + i * (w + gap);
    doc.save().roundedRect(x, y, w, 54, 5).fillAndStroke('#ffffff', LINE).restore();
    doc.font('kr').fontSize(7.5).fillColor(INK_3).text(s.k, x + 10, y + 9, { width: w - 20 });
    doc.font('kr-b').fontSize(15).fillColor(INK).text(s.v, x + 10, y + 20, { width: w - 20 });
    doc.font('kr').fontSize(7.5).fillColor(INK_3).text(s.s, x + 10, y + 40, { width: w - 20 });
  });
}

function legendRow(doc, L, y, items) {
  let x = L;
  for (const [color, opacity, label] of items) {
    doc.save().fillColor(color).fillOpacity(opacity).rect(x, y + 2, 14, 7).fill().restore();
    doc.font('kr').fontSize(7.5).fillColor(INK_2).text(label, x + 19, y, { width: 90 });
    x += 19 + doc.widthOfString(label) + 18;
  }
}

function table(doc, L, W, headers, rows, weights) {
  const widths = weights.map((w) => w * W);
  const rowH = 15;
  const drawHeader = () => {
    const y = doc.y;
    doc.font('kr').fontSize(7.5).fillColor(INK_3);
    headers.forEach((h, i) => {
      const x = L + widths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(h, x, y + 3, { width: widths[i] - 6, align: i === 0 ? 'left' : 'right' });
    });
    doc.y = y + rowH;
    doc.strokeColor(LINE).lineWidth(0.7).moveTo(L, doc.y).lineTo(L + W, doc.y).stroke();
    doc.y += 3;
  };
  drawHeader();
  for (const row of rows) {
    if (doc.y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    doc.font('kr').fontSize(8).fillColor(INK);
    row.forEach((cell, i) => {
      const x = L + widths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(String(cell), x, y, { width: widths[i] - 6, align: i === 0 ? 'left' : 'right' });
    });
    doc.y = y + rowH;
    doc.strokeColor('#f0f1f4').lineWidth(0.5).moveTo(L, doc.y - 3).lineTo(L + W, doc.y - 3).stroke();
  }
}

/** 화면 SVG와 같은 기하(chartGeometry)를 써서 두 그림이 갈라지지 않게 한다. */
function drawChart(doc, report, originX, originY, width, height) {
  const g = chartGeometry(report, { width, height, pad: { t: 14, r: 10, b: 26, l: 40 } });
  const X = (x) => originX + x;
  const Y = (y) => originY + y;

  doc.save();
  doc.rect(X(g.pad.l), Y(g.pad.t), g.plotW, g.plotH).fill('#ffffff');
  doc.lineWidth(0.5).strokeColor('#e6e9ee');
  for (const t of g.yTicks) doc.moveTo(X(g.pad.l), Y(t.y)).lineTo(X(g.width - g.pad.r), Y(t.y)).stroke();

  for (const b of g.decelBands) {
    doc.fillColor(CORAL).fillOpacity(0.16)
      .rect(X(b.x0), Y(g.pad.t), Math.max(b.x1 - b.x0, 1.5), g.plotH).fill();
  }
  doc.fillOpacity(1);

  doc.fillColor(ACCENT).fillOpacity(0.16);
  g.band.forEach(([px, py], i) => (i === 0 ? doc.moveTo(X(px), Y(py)) : doc.lineTo(X(px), Y(py))));
  doc.closePath().fill();
  doc.fillOpacity(1);

  doc.strokeColor(ACCENT).lineWidth(1.2);
  g.line.forEach(([px, py], i) => (i === 0 ? doc.moveTo(X(px), Y(py)) : doc.lineTo(X(px), Y(py))));
  doc.stroke();

  doc.strokeColor('#c9cdd6').lineWidth(0.7)
    .moveTo(X(g.pad.l), Y(g.pad.t)).lineTo(X(g.pad.l), Y(g.pad.t + g.plotH))
    .lineTo(X(g.width - g.pad.r), Y(g.pad.t + g.plotH)).stroke();

  doc.font('kr').fontSize(6.5).fillColor(INK_3);
  for (const t of g.yTicks) doc.text(t.label, X(0), Y(t.y) - 3, { width: g.pad.l - 6, align: 'right' });
  for (const t of g.xTicks) doc.text(t.label, X(t.x) - 15, Y(g.height - g.pad.b + 5), { width: 30, align: 'center' });
  doc.text('km/h', X(g.pad.l), Y(2), { width: 40 });
  doc.restore();
}

function drawFrames(doc, report, framesDirPath, L, W) {
  const cols = 2;
  const gap = 12;
  const w = (W - gap * (cols - 1)) / cols;
  const h = w * 0.5625;
  const cellH = h + 20;

  report.evidence.forEach((f, i) => {
    if (i % cols === 0) ensureSpace(doc, cellH + 8);
    const rowStartY = doc.y;
    const x = L + (i % cols) * (w + gap);
    const y = rowStartY;
    const filePath = f.file && framesDirPath ? path.join(framesDirPath, f.file) : null;
    if (filePath && fs.existsSync(filePath)) {
      try {
        doc.image(filePath, x, y, { fit: [w, h], align: 'center', valign: 'center' });
      } catch {
        placeholder(doc, x, y, w, h);
      }
    } else {
      placeholder(doc, x, y, w, h);
    }
    doc.save().lineWidth(0.7).strokeColor(LINE).rect(x, y, w, h).stroke().restore();
    doc.font('kr').fontSize(7.5).fillColor(INK_2)
      .text(`${secs(f.t)} · ${f.label}`, x, y + h + 4, { width: w });
    // 한 행을 다 그린 뒤에만 커서를 내린다.
    doc.y = (i % cols === cols - 1 || i === report.evidence.length - 1) ? y + cellH + 8 : rowStartY;
  });
  doc.moveDown(0.4);
  if (report.evidence.some((f) => !f.file)) {
    doc.font('kr').fontSize(7.5).fillColor(INK_3)
      .text('일부 프레임 이미지를 추출하지 못했습니다(서버에 ffmpeg 미설치). 없는 장면을 임의로 생성하지 않았습니다.', L, doc.y, { width: W });
    doc.moveDown(0.8);
  }
}

function placeholder(doc, x, y, w, h) {
  doc.save().rect(x, y, w, h).fill('#f1f2f5');
  doc.font('kr').fontSize(7.5).fillColor(INK_3)
    .text('프레임 이미지 없음', x, y + h / 2 - 5, { width: w, align: 'center' });
  doc.restore();
}

/** 모든 면에 해시 꼬리말 — 낱장으로 떨어져 나가도 어느 영상의 결과인지 남는다. */
function addFooters(doc, job) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    // 꼬리말은 본문 아래 여백에 얹는다. 여백을 잠시 0으로 두지 않으면
    // pdfkit 이 "넘쳤다"고 보고 빈 면을 계속 만들어 낸다.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - bottom + 14;
    const L = doc.page.margins.left;
    const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.font('kr').fontSize(6.5).fillColor(INK_3);
    doc.text(`SHA-256 ${job.sha256}`, L, y, { width: W * 0.75, lineBreak: false });
    doc.text(`${i - range.start + 1} / ${range.count}`, L + W * 0.75, y, { width: W * 0.25, align: 'right', lineBreak: false });
    doc.text('참고 자료이며 공식 감정 결과가 아닙니다.', L, y + 9, { width: W, lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.flushPages();
}
