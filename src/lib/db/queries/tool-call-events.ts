import type { Db } from '../index'

export type ToolCallEventType = 'start' | 'stdout' | 'stderr' | 'exit' | 'failure'

export interface ToolCallEventRecord {
  id: string
  session_id: string | null
  tool_name: string
  event_type: ToolCallEventType
  ts: number
  payload: string | null
  exit_code: number | null
  source_file: string
  source_line: number
  correlation_key: string
  dedup_key: string
}

type Stmt = ReturnType<Db['prepare']>

function getInsertStmt(db: Db): Stmt {
  return db.prepare(
    `INSERT INTO tool_call_event (
      id, session_id, tool_name, event_type, ts, payload, exit_code,
      source_file, source_line, correlation_key, dedup_key
    ) VALUES (
      @id, @session_id, @tool_name, @event_type, @ts, @payload, @exit_code,
      @source_file, @source_line, @correlation_key, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )
}

export function insertToolCallEvents(db: Db, records: ToolCallEventRecord[]): number {
  if (records.length === 0) return 0
  const stmt = getInsertStmt(db)
  let changes = 0
  for (const record of records) {
    const result = stmt.run({
      ...record,
      id: record.id ?? record.dedup_key,
    })
    changes += Number(result?.changes ?? 0)
  }
  return changes
}
