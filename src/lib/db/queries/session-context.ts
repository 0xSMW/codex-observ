import type { Db } from '../index'

export interface SessionContextRecord {
  id: string
  session_id: string
  ts: number
  model: string | null
  model_provider: string | null
  source_file: string
  source_line: number
  dedup_key: string
}

type Stmt = ReturnType<Db['prepare']>

function getInsertStmt(db: Db): Stmt {
  return db.prepare(
    `INSERT INTO session_context (id, session_id, ts, model, model_provider, source_file, source_line, dedup_key)
     VALUES (@id, @session_id, @ts, @model, @model_provider, @source_file, @source_line, @dedup_key)
     ON CONFLICT(dedup_key) DO NOTHING`
  )
}

export function insertSessionContext(db: Db, record: SessionContextRecord): boolean {
  const result = getInsertStmt(db).run(record)
  return Number(result?.changes ?? 0) > 0
}
