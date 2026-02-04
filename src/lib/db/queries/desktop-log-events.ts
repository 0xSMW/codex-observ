import type { Db } from '../index'

export interface DesktopLogEventRecord {
  id: string
  app_session_id: string | null
  ts: number
  level: string | null
  component: string | null
  message: string | null
  payload_text: string | null
  process_id: number | null
  thread_id: number | null
  instance_id: number | null
  segment_index: number | null
  file_path: string
  line_number: number
  dedup_key: string
  created_at: number
}

type Stmt = ReturnType<Db['prepare']>

function getInsertStmt(db: Db): Stmt {
  return db.prepare(
    `INSERT INTO desktop_log_event (
      id,
      app_session_id,
      ts,
      level,
      component,
      message,
      payload_text,
      process_id,
      thread_id,
      instance_id,
      segment_index,
      file_path,
      line_number,
      dedup_key,
      created_at
    ) VALUES (
      @id,
      @app_session_id,
      @ts,
      @level,
      @component,
      @message,
      @payload_text,
      @process_id,
      @thread_id,
      @instance_id,
      @segment_index,
      @file_path,
      @line_number,
      @dedup_key,
      @created_at
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )
}

export function insertDesktopLogEvents(db: Db, records: DesktopLogEventRecord[]): number {
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
