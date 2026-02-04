import type { Db } from '../index'

export interface AutomationEventRecord {
  id: string
  ts: number
  action: string
  thread_id: string | null
  status: string | null
  error: string | null
  app_session_id: string | null
  source_log_id: string | null
  dedup_key: string
}

type Stmt = ReturnType<Db['prepare']>

function getInsertStmt(db: Db): Stmt {
  return db.prepare(
    `INSERT INTO automation_event (
      id,
      ts,
      action,
      thread_id,
      status,
      error,
      app_session_id,
      source_log_id,
      dedup_key
    ) VALUES (
      @id,
      @ts,
      @action,
      @thread_id,
      @status,
      @error,
      @app_session_id,
      @source_log_id,
      @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )
}

export function insertAutomationEvents(db: Db, records: AutomationEventRecord[]): number {
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
