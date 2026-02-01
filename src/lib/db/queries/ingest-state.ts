import type { Db } from '../index'

export interface IngestStateRecord {
  path: string
  byte_offset: number
  mtime_ms: number | null
  updated_at: number
}

type Stmt = ReturnType<Db['prepare']>
type Statements = {
  getByPath: Stmt
  upsert: Stmt
  deleteByPath: Stmt
}

const statementCache = new WeakMap<Db, Statements>()

function getStatements(db: Db): Statements {
  const cached = statementCache.get(db)
  if (cached) {
    return cached
  }

  const statements: Statements = {
    getByPath: db.prepare(
      'SELECT path, byte_offset, mtime_ms, updated_at FROM ingest_state WHERE path = ?'
    ),
    upsert: db.prepare(
      `INSERT INTO ingest_state (path, byte_offset, mtime_ms, updated_at)
       VALUES (@path, @byte_offset, @mtime_ms, @updated_at)
       ON CONFLICT(path) DO UPDATE SET
         byte_offset = excluded.byte_offset,
         mtime_ms = excluded.mtime_ms,
         updated_at = excluded.updated_at`
    ),
    deleteByPath: db.prepare('DELETE FROM ingest_state WHERE path = ?'),
  }

  statementCache.set(db, statements)
  return statements
}

export function getIngestState(db: Db, path: string): IngestStateRecord | null {
  const row = getStatements(db).getByPath.get(path) as IngestStateRecord | undefined
  return row ?? null
}

export function setIngestState(
  db: Db,
  state: Omit<IngestStateRecord, 'updated_at'> & { updated_at?: number }
): void {
  const now = state.updated_at ?? Date.now()
  getStatements(db).upsert.run({
    path: state.path,
    byte_offset: state.byte_offset,
    mtime_ms: state.mtime_ms,
    updated_at: now,
  })
}

export function deleteIngestState(db: Db, path: string): boolean {
  const result = getStatements(db).deleteByPath.run(path)
  return Number(result.changes ?? 0) > 0
}
