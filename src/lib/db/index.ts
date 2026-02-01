import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { ensureMigrations } from './migrations'

let dbInstance: Database.Database | null = null

function resolveDbPath(): string {
  const envPath = process.env.CODEX_OBSERV_DB_PATH
  if (envPath && envPath.trim().length > 0) {
    return envPath
  }
  return path.join(os.homedir(), '.codex-observ', 'data.db')
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  ensureMigrations(db)
  dbInstance = db
  return dbInstance
}

export function closeDb(): void {
  if (!dbInstance) {
    return
  }
  dbInstance.close()
  dbInstance = null
}
