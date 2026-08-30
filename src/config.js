/**
 * 모든 미확정 값은 여기 한 곳에 모은다.
 *
 * 브리프 §6 "결정 필요" 항목은 임의로 확정하지 않는다.
 * 코드가 돌아가려면 값이 있어야 하므로 "잠정값"을 넣되,
 * 반드시 `TODO: 결정 필요` 주석을 달고 환경변수로 덮어쓸 수 있게 둔다.
 * 확정되면 주석을 지우고 기본값을 바꾼다.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
const bool = (v, d) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

export const config = {
  root: ROOT,
  env: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 3000),
  /** 메일 링크에 쓰는 절대 주소. 배포 시 반드시 실제 도메인으로. */
  baseUrl: process.env.BASE_URL ?? `http://localhost:${num(process.env.PORT, 3000)}`,

  // ── 서비스 정체성 ──────────────────────────────────────────────
  /** TODO: 결정 필요 — 서비스명 미정 (브리프 §6). 확정 전까지 기능 설명으로 표기한다. */
  serviceName: process.env.SERVICE_NAME ?? '블랙박스 속도 분석',
  supportEmail: process.env.SUPPORT_EMAIL ?? 'support@example.com',

  // ── 업로드 제약 (브리프 §3 공통, 상수로 분리 요구) ──────────────
  upload: {
    allowedExtensions: ['.mp4', '.mov'],
    allowedMimeTypes: ['video/mp4', 'video/quicktime', 'application/octet-stream'],
    maxBytes: num(process.env.MAX_UPLOAD_BYTES, 500 * 1024 * 1024), // 500MB
    maxDurationSeconds: num(process.env.MAX_DURATION_SECONDS, 180), // 3분
  },

  /** SC-02 사용 용도 — 다음 분기 방향을 정하는 유일한 정성 데이터 (브리프 §3). */
  purposes: [
    { value: 'accident_dispute', label: '사고 분쟁' },
    { value: 'insurance_claim', label: '보험 청구' },
    { value: 'work_research', label: '업무·연구' },
    { value: 'etc', label: '기타' },
  ],

  // ── 영상 정책 ─────────────────────────────────────────────────
  storage: {
    dataDir: process.env.DATA_DIR ?? path.join(ROOT, 'var'),
    /**
     * TODO: 결정 필요 — 보관 기간 미정 (브리프 §6 영상 정책).
     * 랜딩·동의 문안이 이 값을 그대로 인용하므로 확정 전에는 바꾸지 말 것.
     * 확정되면 config 한 곳만 고치면 UI 문구까지 따라 바뀐다.
     */
    retentionHours: num(process.env.RETENTION_HOURS, 72),
    /** TODO: 결정 필요 — 제3자 제공 여부. 현재는 "제공하지 않음"으로 문구가 나간다. */
    thirdPartySharing: bool(process.env.THIRD_PARTY_SHARING, false),
    /** 원본 삭제 후에도 결과·해시는 남긴다 (제출 자료 신뢰도). */
    keepResultsAfterVideoDeletion: true,
    sweepIntervalMs: num(process.env.SWEEP_INTERVAL_MS, 10 * 60 * 1000),
  },

  // ── 처리 사양 ─────────────────────────────────────────────────
  worker: {
    /** TODO: 결정 필요 — 동시 처리 용량 미정 (브리프 §6 처리 사양). */
    concurrency: num(process.env.WORKER_CONCURRENCY, 1),
    /** TODO: 결정 필요 — 목표 처리 시간 미정. p95 5분이 이탈 임계선 (브리프 §5). */
    targetP95Seconds: num(process.env.TARGET_P95_SECONDS, 300),
    maxAttempts: num(process.env.WORKER_MAX_ATTEMPTS, 2),
    pollIntervalMs: num(process.env.WORKER_POLL_INTERVAL_MS, 1000),
    /** 실행 중 프로세스가 죽었을 때 되살릴 기준 시간. */
    staleAfterMs: num(process.env.WORKER_STALE_AFTER_MS, 30 * 60 * 1000),
  },

  // ── 모델 · 정확도 표기 ─────────────────────────────────────────
  model: {
    /** 속도 추정 모델 어댑터. 'stub' | 'command' */
    adapter: process.env.MODEL_ADAPTER ?? 'stub',
    /** adapter=command 일 때 실행할 명령. 인자로 영상 경로를 받고 JSON을 stdout으로 낸다. */
    command: process.env.MODEL_COMMAND ?? '',
    commandTimeoutMs: num(process.env.MODEL_COMMAND_TIMEOUT_MS, 15 * 60 * 1000),
    /** 크로스 비클 MAE 1~2 m/s (브리프 §1). 표기는 이 범위를 그대로 쓴다. */
    maeMinMs: 1.0,
    maeMaxMs: 2.0,
    /**
     * TODO: 결정 필요 — p95·최대 오차 미측정 (브리프 §6 오차 표기).
     * null 이면 UI는 p95를 숫자로 말하지 않고 "측정 중"으로 표기한다.
     * 측정 전에 임의의 숫자를 넣지 말 것.
     */
    p95ErrorMs: process.env.P95_ERROR_MS ? Number(process.env.P95_ERROR_MS) : null,
    /** 그래프 음영에 쓰는 신뢰구간 폭. 모델이 구간을 주면 그 값을 우선한다. */
    fallbackBandMs: num(process.env.FALLBACK_BAND_MS, 2.0),
  },

  /** 감속 구간 탐지 — 절대 속도와 동등하게 다루는 핵심 지표 (브리프 §1). */
  deceleration: {
    /** TODO: 결정 필요 — 실무자 인터뷰(§7) 결과에 따라 임계값 재조정. */
    minRateMs2: num(process.env.DECEL_MIN_RATE, 2.0), // m/s^2
    minDropMs: num(process.env.DECEL_MIN_DROP, 2.8), // 약 10km/h
    minDurationSeconds: num(process.env.DECEL_MIN_DURATION, 0.5),
  },

  /** 근거 프레임 개수 (브리프 §3 SC-04: 3~5장). */
  evidenceFrames: {
    min: 3,
    max: 5,
    /** ffmpeg 가 있으면 실제 프레임을 뽑고, 없으면 자리표시자로 표기한다. */
    ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg',
  },

  // ── 메일 ─────────────────────────────────────────────────────
  mail: {
    from: process.env.MAIL_FROM ?? 'no-reply@example.com',
    smtpUrl: process.env.SMTP_URL ?? '', // 비어 있으면 var/mail 에 .eml 로 떨군다
  },

  // ── Fake door (SC-05) ────────────────────────────────────────
  paywall: {
    /**
     * TODO: 결정 필요 — 결제 모델·가격 미정 (브리프 §6).
     * PG 연동은 제외 목록. 가격은 화면에 노출하지 않고 클릭률만 모은다.
     */
    enabled: true,
    displayPrice: null, // 확정 전까지 null 유지
  },

  /** 랜딩에 붙일 실제 분석 리포트 샘플 (브리프 §3 SC-01: 더미 금지). */
  sampleReportToken: process.env.SAMPLE_REPORT_TOKEN ?? '',
};

/** TODO: 결정 필요 — 고지·동의 문안은 법적 검토 필요 (브리프 §6). 검토 전 임의 수정 금지. */
export const legal = {
  /** SC-04·PDF 양쪽에서 제거 금지. */
  disclaimer:
    '이 리포트는 영상 기반 자동 추정 결과로, 참고 자료이며 공식 감정 결과가 아닙니다. ' +
    '법적 분쟁의 증거로 사용하려면 자격을 갖춘 감정인의 별도 감정이 필요합니다.',
  accuracyNote:
    `추정 속도에는 오차가 있습니다. 교차 차종 검증 기준 평균 절대 오차(MAE) ` +
    `${config.model.maeMinMs}~${config.model.maeMaxMs} m/s ` +
    `(약 ${(config.model.maeMinMs * 3.6).toFixed(1)}~${(config.model.maeMaxMs * 3.6).toFixed(1)} km/h)이며, ` +
    `개별 구간의 오차는 이보다 클 수 있습니다. 그래프의 음영은 추정 구간을 나타냅니다.`,
  retentionNote: () =>
    `업로드한 영상은 분석 후 ${config.storage.retentionHours}시간이 지나면 자동 삭제됩니다. ` +
    (config.storage.thirdPartySharing ? '' : '제3자에게 제공하지 않습니다. ') +
    '분석 결과와 영상 해시는 결과 링크 확인을 위해 보관됩니다.',
  consentLabel: () =>
    `영상 처리 및 ${config.storage.retentionHours}시간 보관 후 자동 삭제 정책에 동의합니다.`,
};

export default config;
