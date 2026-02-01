import type { Db } from '../index'

export interface ModelCallRecord {
  id: string
  session_id: string
  ts: number
  model: string | null
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
  duration_ms: number | null
  source_file: string
  source_line: number
  dedup_key: string
}

type Stmt = ReturnType<Db['prepare']>
type Statements = {
  insert: Stmt
  getById: Stmt
  deleteById: Stmt
}

const statementCache = new WeakMap<Db, Statements>()

function getStatements(db: Db): Statements {
  const cached = statementCache.get(db)
  if (cached) {
    return cached
  }

  const insert = db.prepare(
    `INSERT INTO model_call (
      id, session_id, ts, model, input_tokens, cached_input_tokens,
      output_tokens, reasoning_tokens, total_tokens, duration_ms,
      source_file, source_line, dedup_key
    ) VALUES (
      @id, @session_id, @ts, @model, @input_tokens, @cached_input_tokens,
      @output_tokens, @reasoning_tokens, @total_tokens, @duration_ms,
      @source_file, @source_line, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )

  const getById = db.prepare(
    `SELECT id, session_id, ts, model, input_tokens, cached_input_tokens,
      output_tokens, reasoning_tokens, total_tokens, duration_ms,
      source_file, source_line, dedup_key
     FROM model_call
     WHERE id = ?`
  )

  const deleteById = db.prepare('DELETE FROM model_call WHERE id = ?')

  const statements: Statements = { insert, getById, deleteById }
  statementCache.set(db, statements)
  return statements
}

export function insertModelCall(db: Db, record: ModelCallRecord): boolean {
  const result = getStatements(db).insert.run(record)
  return Number(result.changes ?? 0) > 0
}

export function getModelCallById(db: Db, id: string): ModelCallRecord | null {
  const row = getStatements(db).getById.get(id) as ModelCallRecord | undefined
  return row ?? null
}

export function deleteModelCallById(db: Db, id: string): boolean {
  const result = getStatements(db).deleteById.run(id)
  return Number(result.changes ?? 0) > 0
}
