/**
 * 실패 사유 카탈로그 (브리프 §3 SC-06).
 *
 * "오류가 발생했습니다"는 재시도를 막는다. 모든 실패는
 * (1) 무엇이 문제인지 (2) 무엇을 하면 되는지 를 함께 낸다.
 * 화면·메일·이벤트 라벨이 전부 이 표에서 나온다.
 */
import { config } from './config.js';

const mb = (bytes) => Math.round(bytes / 1024 / 1024);

export const FAILURES = {
  EXT_NOT_ALLOWED: () => ({
    title: '지원하지 않는 파일 형식입니다',
    detail: `현재 ${config.upload.allowedExtensions.join(', ')} 파일만 분석할 수 있습니다.`,
    remedies: [
      '블랙박스 전용 뷰어에서 "내보내기 / 변환" 기능으로 mp4로 저장한 뒤 다시 올려 주세요.',
      '무료 변환 도구(예: HandBrake)로 mp4(H.264)로 변환하면 대부분 처리됩니다.',
    ],
  }),
  TOO_LARGE: (ctx = {}) => ({
    title: '파일이 너무 큽니다',
    detail: `${mb(config.upload.maxBytes)}MB 이하만 올릴 수 있습니다.` +
      (ctx.sizeBytes ? ` 올리신 파일은 약 ${mb(ctx.sizeBytes)}MB입니다.` : ''),
    remedies: [
      '사고 전후 구간만 잘라서 올려 주세요. 충돌 시점 앞뒤 30초면 충분합니다.',
      '해상도를 낮추면 용량이 크게 줄어듭니다. 분석 정확도에는 큰 영향이 없습니다.',
    ],
  }),
  TOO_LONG: (ctx = {}) => ({
    title: '영상이 너무 깁니다',
    detail: `${config.upload.maxDurationSeconds}초(${Math.round(config.upload.maxDurationSeconds / 60)}분) 이하만 분석할 수 있습니다.` +
      (ctx.durationSeconds ? ` 올리신 영상은 약 ${Math.round(ctx.durationSeconds)}초입니다.` : ''),
    remedies: [
      '속도가 쟁점인 구간만 잘라서 올려 주세요.',
      '블랙박스 뷰어의 구간 저장 기능을 쓰면 재인코딩 없이 자를 수 있습니다.',
    ],
  }),
  NOT_A_VIDEO: () => ({
    title: '영상 파일을 읽지 못했습니다',
    detail: '확장자는 맞지만 파일 내부 구조가 mp4/mov 형식이 아닙니다. 전송 중 손상됐거나 일부만 복사된 파일일 수 있습니다.',
    remedies: [
      'SD카드에서 다시 복사한 뒤 올려 주세요.',
      '해당 파일이 블랙박스 뷰어에서 정상 재생되는지 먼저 확인해 주세요.',
    ],
  }),
  DURATION_UNKNOWN: () => ({
    title: '영상 길이를 확인하지 못했습니다',
    detail: '일부 블랙박스는 표준과 다른 방식으로 파일을 기록합니다. 아직 이 형식은 지원하지 않습니다.',
    remedies: [
      '뷰어에서 mp4로 다시 내보낸 뒤 올려 주세요.',
      '아래에 쓰시는 블랙박스 기종을 남겨 주시면 지원 목록에 반영합니다.',
    ],
  }),
  MISSING_FIELD: (ctx = {}) => ({
    title: '입력이 완료되지 않았습니다',
    detail: ctx.message ?? '필수 입력값이 비어 있습니다.',
    remedies: ['업로드 화면으로 돌아가 비어 있는 항목을 채워 주세요.'],
  }),
  // ── 워커 단계 실패 ──────────────────────────────────────────
  ANALYSIS_FAILED: (ctx = {}) => ({
    title: '분석 중 오류가 발생했습니다',
    detail: ctx.message ?? '속도 추정 과정에서 처리가 중단됐습니다.',
    remedies: [
      '같은 영상을 한 번 더 올려 주시면 다시 시도합니다.',
      '반복해서 실패하면 아래에 기종을 남겨 주세요. 원인을 직접 확인해 회신드립니다.',
    ],
  }),
  INSUFFICIENT_MOTION: () => ({
    title: '속도를 추정할 만한 화면 변화가 없습니다',
    detail: '정차 중이거나 화면 대부분이 가려진 구간으로 보입니다. 노면·주변 구조물이 보여야 속도를 추정할 수 있습니다.',
    remedies: [
      '주행 중 구간이 포함되도록 다시 잘라서 올려 주세요.',
      '야간·역광으로 노면이 보이지 않으면 추정이 어렵습니다.',
    ],
  }),
  VIDEO_EXPIRED: () => ({
    title: '보관 기간이 지나 원본 영상이 삭제됐습니다',
    detail: `업로드된 영상은 ${config.storage.retentionHours}시간 후 자동 삭제됩니다. 분석 결과는 그대로 보실 수 있습니다.`,
    remedies: ['다시 분석하려면 영상을 새로 올려 주세요.'],
  }),
};

export function describeFailure(code, ctx) {
  const build = FAILURES[code] ?? FAILURES.ANALYSIS_FAILED;
  return { code, ...build(ctx) };
}

/** 워커가 던지는 분류된 예외. */
export class AnalysisError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}
