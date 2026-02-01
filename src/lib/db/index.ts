import fs from 'fs'
import os from 'os'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { ensureMigrations } from './migrations'

export type Db = DatabaseSync & {
  transaction: <T, A extends unknown[]>(fn: (...args: A) => T) => (...args: A) => T
}

let dbInstance: Db | null = null

function resolveDbPath(): string {
  const envPath = process.env.CODEX_OBSERV_DB_PATH
  if (envPath && envPath.trim().length > 0) {
    return envPath
  }
  return path.join(os.homedir(), '.codex-observ', 'data.db')
}

function addTransaction(db: DatabaseSync): Db {
  const ext = db as Db
  ext.transaction = <T, A extends unknown[]>(fn: (...args: A) => T) => {
    return (...args: A): T => {
      db.exec('BEGIN')
      try {
        const result = fn(...args)
        db.exec('COMMIT')
        return result
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    }
  }
  return ext
}

export function getDb(): Db {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = resolveDbPath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new DatabaseSync(dbPath, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
  })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 5000')

  dbInstance = addTransaction(db)
  ensureMigrations(dbInstance)
  return dbInstance
}

export function closeDb(): void {
  if (!dbInstance) {
    return
  }
  dbInstance.close()
  dbInstance = null
}
