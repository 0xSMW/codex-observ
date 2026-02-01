import fs from 'fs'
import path from 'path'
import type { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 2

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
  } catch {
    // column may already exist
  }
  try {
    db.exec('ALTER TABLE session ADD COLUMN project_ref_id TEXT NULL')
  } catch {
    // column may already exist
  }
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
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}
