/** SQLite 한 파일. 초기 물량에서는 관리자 대시보드 대신 이 DB를 직접 조회한다 (브리프 §2 제외 목록). */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.storage.dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(config.storage.dataDir, 'app.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  token         TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL,
  purpose       TEXT NOT NULL,
  filename      TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  duration_s    REAL,
  sha256        TEXT NOT NULL,
  video_path    TEXT,
  video_deleted_at TEXT,
  status        TEXT NOT NULL,           -- queued | running | done | failed
  attempts      INTEGER NOT NULL DEFAULT 0,
  failure_code  TEXT,
  failure_message TEXT,
  result_json   TEXT,
  model_version TEXT,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  job_id     INTEGER,
  props      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_name ON events(name, created_at);

CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      INTEGER NOT NULL REFERENCES jobs(id),
  is_accurate INTEGER NOT NULL,
  actual_kmh  REAL,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_interest (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     INTEGER REFERENCES jobs(id),
  email      TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  device       TEXT NOT NULL,
  note         TEXT,
  email        TEXT,
  failure_code TEXT,
  created_at   TEXT NOT NULL
);
`);

export const now = () => new Date().toISOString();

const stmt = (sql) => db.prepare(sql);

export const jobs = {
  create: stmt(`INSERT INTO jobs
    (token, email, purpose, filename, size_bytes, duration_s, sha256, video_path, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)`),
  byToken: stmt('SELECT * FROM jobs WHERE token = ?'),
  byId: stmt('SELECT * FROM jobs WHERE id = ?'),
  claimNext: stmt(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1`),
  markRunning: stmt(`UPDATE jobs SET status='running', started_at=?, attempts=attempts+1 WHERE id=? AND status='queued'`),
  markDone: stmt(`UPDATE jobs SET status='done', result_json=?, model_version=?, finished_at=? WHERE id=?`),
  markFailed: stmt(`UPDATE jobs SET status='failed', failure_code=?, failure_message=?, finished_at=? WHERE id=?`),
  requeue: stmt(`UPDATE jobs SET status='queued', started_at=NULL WHERE id=?`),
  runningCount: stmt(`SELECT COUNT(*) AS n FROM jobs WHERE status='running'`),
  staleRunning: stmt(`SELECT * FROM jobs WHERE status='running' AND started_at < ?`),
  expiredVideos: stmt(`SELECT * FROM jobs WHERE video_path IS NOT NULL AND video_deleted_at IS NULL AND created_at < ?`),
  markVideoDeleted: stmt(`UPDATE jobs SET video_path=NULL, video_deleted_at=? WHERE id=?`),
};

export const feedback = {
  insert: stmt(`INSERT INTO feedback (job_id, is_accurate, actual_kmh, note, created_at) VALUES (?,?,?,?,?)`),
  forJob: stmt(`SELECT * FROM feedback WHERE job_id = ? ORDER BY id DESC LIMIT 1`),
};

export const reviewInterest = {
  insert: stmt(`INSERT INTO review_interest (job_id, email, created_at) VALUES (?,?,?)`),
};

export const deviceReports = {
  insert: stmt(`INSERT INTO device_reports (device, note, email, failure_code, created_at) VALUES (?,?,?,?,?)`),
};

export const events = {
  insert: stmt(`INSERT INTO events (name, job_id, props, created_at) VALUES (?,?,?,?)`),
};
