import { createApp } from './app.js';
import { config } from './config.js';
import { startWorker } from './worker.js';
import { startRetentionSweeper } from './storage.js';

const app = createApp();
const worker = startWorker();
startRetentionSweeper();

const server = app.listen(config.port, () => {
  console.log(`[server] ${config.baseUrl} (모델 어댑터: ${config.model.adapter}, 동시 처리 ${config.worker.concurrency})`);
  if (config.model.adapter === 'stub') {
    console.warn('[server] 스텁 어댑터로 실행 중입니다. 실제 분석 결과가 아닙니다.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    worker.stop();
    server.close(() => process.exit(0));
  });
}
