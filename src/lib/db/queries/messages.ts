import type { Db } from '../index'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface MessageRecord {
  id: string
  session_id: string
  role: MessageRole
  ts: number
  content: string | null
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
    `INSERT INTO message (
      id, session_id, role, ts, content, source_file, source_line, dedup_key
    ) VALUES (
      @id, @session_id, @role, @ts, @content, @source_file, @source_line, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )

  const getById = db.prepare(
    `SELECT id, session_id, role, ts, content, source_file, source_line, dedup_key
     FROM message
     WHERE id = ?`
  )

  const deleteById = db.prepare('DELETE FROM message WHERE id = ?')

  const statements: Statements = { insert, getById, deleteById }
  statementCache.set(db, statements)
  return statements
}

export function insertMessage(db: Db, record: MessageRecord): boolean {
  const result = getStatements(db).insert.run(record)
  return Number(result.changes ?? 0) > 0
}

export function getMessageById(db: Db, id: string): MessageRecord | null {
  const row = getStatements(db).getById.get(id) as MessageRecord | undefined
  return row ?? null
}

export function deleteMessageById(db: Db, id: string): boolean {
  const result = getStatements(db).deleteById.run(id)
  return Number(result.changes ?? 0) > 0
}
