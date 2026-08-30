/**
 * 외부 명령 어댑터 — 실제 모델을 붙이는 지점.
 *
 *   MODEL_ADAPTER=command
 *   MODEL_COMMAND="python /opt/model/estimate.py"
 *
 * 명령은 마지막 인자로 영상 경로를 받고, stdout 으로 어댑터 계약 JSON 을 낸다.
 * 종료 코드가 0이 아니면 stderr 마지막 줄을 실패 사유로 쓴다.
 * stderr 첫 토큰이 실패 코드(예: INSUFFICIENT_MOTION)면 그대로 분류한다.
 */
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { AnalysisError, FAILURES } from '../failures.js';

export function runCommand(job, videoPath) {
  const cmd = config.model.command.trim();
  if (!cmd) throw new Error('MODEL_COMMAND 가 비어 있습니다.');
  const [bin, ...args] = cmd.split(/\s+/);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...args, videoPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new AnalysisError('ANALYSIS_FAILED', '처리 시간이 제한을 초과했습니다.'));
    }, config.model.commandTimeoutMs);
    timer.unref?.();

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new AnalysisError('ANALYSIS_FAILED', `모델 실행 실패: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const lines = err.trim().split('\n').filter(Boolean);
        const last = lines.at(-1) ?? `모델이 종료 코드 ${code} 로 끝났습니다.`;
        const token = last.split(/[\s:]/)[0];
        return reject(new AnalysisError(token in FAILURES ? token : 'ANALYSIS_FAILED', last));
      }
      try {
        const parsed = JSON.parse(out);
        if (!Array.isArray(parsed.samples) || parsed.samples.length === 0) {
          return reject(new AnalysisError('ANALYSIS_FAILED', '모델이 속도 표본을 반환하지 않았습니다.'));
        }
        resolve({ modelVersion: parsed.modelVersion ?? 'unknown', ...parsed });
      } catch (e) {
        reject(new AnalysisError('ANALYSIS_FAILED', `모델 출력을 해석하지 못했습니다: ${e.message}`));
      }
    });
  });
}
