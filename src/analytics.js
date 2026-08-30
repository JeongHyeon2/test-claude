/** 퍼널 이벤트 (브리프 §5). 이벤트 이름은 여기서만 정의한다. */
import { events, now } from './db.js';

export const EVENT = {
  LANDING_VIEW: 'landing_view',
  UPLOAD_START: 'upload_start',
  UPLOAD_COMPLETE: 'upload_complete',
  JOB_STARTED: 'job_started',
  JOB_FAILED: 'job_failed',
  RESULT_VIEW: 'result_view',
  PDF_DOWNLOAD: 'pdf_download', // ★ 북극성 지표
  PAYWALL_CLICK: 'paywall_click', // ★ 지불 의사
  ACCURACY_FEEDBACK: 'accuracy_feedback',
  UNSUPPORTED_FILE: 'unsupported_file',
  DEVICE_REPORT_SUBMIT: 'device_report_submit',
};

export function track(name, { jobId = null, ...props } = {}) {
  try {
    events.insert.run(name, jobId, JSON.stringify(props), now());
  } catch (err) {
    // 계측 실패가 사용자 흐름을 막지 않는다.
    console.error('[analytics] failed', name, err.message);
  }
}
