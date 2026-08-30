/**
 * 속도 추정 모델 어댑터.
 *
 * 모델 자체는 이 저장소 밖에서 이미 완성되어 있다 (브리프 §1).
 * 여기서는 "어떤 형태로 결과를 받을지"만 고정하고, 교체 가능하게 둔다.
 *
 * 어댑터 계약 — 아래 형태의 객체를 반환한다:
 * {
 *   modelVersion: string,
 *   samples: [{ t: 초, v: m/s, lo?: m/s, hi?: m/s }],   // t 오름차순
 *   notes?: string[],
 *   stub?: boolean                                       // 스텁이면 true
 * }
 * 신뢰구간(lo/hi)을 주지 않으면 config.model.fallbackBandMs 로 채운다.
 * 추정 불가 상황은 AnalysisError(code) 를 던진다.
 */
import { config } from '../config.js';
import { runStub } from './stub.js';
import { runCommand } from './command.js';

export async function estimateSpeed(job, videoPath) {
  switch (config.model.adapter) {
    case 'command':
      return runCommand(job, videoPath);
    case 'stub':
      return runStub(job, videoPath);
    default:
      throw new Error(`알 수 없는 MODEL_ADAPTER: ${config.model.adapter}`);
  }
}
