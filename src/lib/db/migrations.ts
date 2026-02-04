import fs from 'fs'
import path from 'path'
import type { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 3

function loadSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), 'src', 'lib', 'db', 'schema.sql')
  return fs.readFileSync(schemaPath, 'utf8')
}

function migrationFrom1To2(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NULL,
      git_remote TEXT NULL,
      first_seen_ts INTEGER NULL,
      last_seen_ts INTEGER NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_last_seen ON project(last_seen_ts);

    CREATE TABLE IF NOT EXISTS project_ref (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT NULL,
      "commit" TEXT NULL,
      cwd TEXT NULL,
      first_seen_ts INTEGER NULL,
      last_seen_ts INTEGER NULL,
      FOREIGN KEY(project_id) REFERENCES project(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_ref_project ON project_ref(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_ref_last_seen ON project_ref(last_seen_ts);

    CREATE TABLE IF NOT EXISTS session_context (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      model TEXT NULL,
      model_provider TEXT NULL,
      source_file TEXT NOT NULL,
      source_line INTEGER NOT NULL,
      dedup_key TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_session_context_dedup_key ON session_context(dedup_key);
    CREATE INDEX IF NOT EXISTS idx_session_context_session_ts ON session_context(session_id, ts);
  `)
  try {
    db.exec('ALTER TABLE session ADD COLUMN project_id TEXT NULL')
  } catch (_) {
    // column may already exist
  }
  try {
    db.exec('ALTER TABLE session ADD COLUMN project_ref_id TEXT NULL')
  } catch (_) {
    // column may already exist
  }
}

function migrationFrom2To3(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS desktop_log_event (
      id TEXT PRIMARY KEY,
      app_session_id TEXT NULL,
      ts INTEGER NOT NULL,
      level TEXT NULL,
      component TEXT NULL,
      message TEXT NULL,
      payload_text TEXT NULL,
      process_id INTEGER NULL,
      thread_id INTEGER NULL,
      instance_id INTEGER NULL,
      segment_index INTEGER NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER NOT NULL,
      dedup_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_desktop_log_event_dedup_key ON desktop_log_event(dedup_key);
    CREATE INDEX IF NOT EXISTS idx_desktop_log_event_ts ON desktop_log_event(ts);
    CREATE INDEX IF NOT EXISTS idx_desktop_log_event_session ON desktop_log_event(app_session_id);

    CREATE TABLE IF NOT EXISTS worktree_event (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      action TEXT NOT NULL,
      worktree_path TEXT NULL,
      repo_root TEXT NULL,
      branch TEXT NULL,
      status TEXT NULL,
      error TEXT NULL,
      app_session_id TEXT NULL,
      source_log_id TEXT NULL,
      dedup_key TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_worktree_event_dedup_key ON worktree_event(dedup_key);
    CREATE INDEX IF NOT EXISTS idx_worktree_event_ts ON worktree_event(ts);
    CREATE INDEX IF NOT EXISTS idx_worktree_event_action ON worktree_event(action);

    CREATE TABLE IF NOT EXISTS automation_event (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      action TEXT NOT NULL,
      thread_id TEXT NULL,
      status TEXT NULL,
      error TEXT NULL,
      app_session_id TEXT NULL,
      source_log_id TEXT NULL,
      dedup_key TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_event_dedup_key ON automation_event(dedup_key);
    CREATE INDEX IF NOT EXISTS idx_automation_event_ts ON automation_event(ts);
    CREATE INDEX IF NOT EXISTS idx_automation_event_action ON automation_event(action);

    CREATE TABLE IF NOT EXISTS worktree_daily (
      date TEXT PRIMARY KEY,
      created_count INTEGER NOT NULL,
      deleted_count INTEGER NOT NULL,
      error_count INTEGER NOT NULL,
      active_count INTEGER NOT NULL,
      avg_create_duration_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS automation_daily (
      date TEXT PRIMARY KEY,
      runs_queued INTEGER NOT NULL,
      runs_completed INTEGER NOT NULL,
      runs_failed INTEGER NOT NULL,
      avg_duration_ms INTEGER NOT NULL,
      backlog_peak INTEGER NOT NULL
    );
  `)
}

export function ensureMigrations(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  let currentVersion = row?.user_version ?? 0

  if (currentVersion === SCHEMA_VERSION) {
    return
  }

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${SCHEMA_VERSION}.`
    )
  }

  if (currentVersion === 0) {
    const schemaSql = loadSchemaSql()
    db.exec(schemaSql)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
    return
  }

  while (currentVersion < SCHEMA_VERSION) {
    if (currentVersion === 1) {
      migrationFrom1To2(db)
      currentVersion = 2
    }
    if (currentVersion === 2) {
      migrationFrom2To3(db)
      currentVersion = 3
    }
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}
