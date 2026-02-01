export type ToolCallStatus = 'ok' | 'failed' | 'unknown'

export interface ToolCallInsert {
  id?: string
  session_id?: string | null
  tool_name: string
  command: string | null
  status: ToolCallStatus
  start_ts: number
  end_ts: number | null
  duration_ms: number | null
  exit_code: number | null
  error: string | null
  stdout_bytes: number | null
  stderr_bytes: number | null
  source_file: string
  source_line: number
  correlation_key: string
  dedup_key: string
}

export interface DateRange {
  start?: number
  end?: number
}

export interface DbLike {
  prepare: (sql: string) => {
    run: (...params: any[]) => { changes?: number }
    get: (...params: any[]) => unknown
    all: (...params: any[]) => unknown[]
  }
  transaction?: <T>(fn: () => T) => () => T
}

export function insertToolCalls(db: DbLike, records: ToolCallInsert[]): number {
  if (!records.length) return 0

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO tool_call (
      id,
      session_id,
      tool_name,
      command,
      status,
      start_ts,
      end_ts,
      duration_ms,
      exit_code,
      error,
      stdout_bytes,
      stderr_bytes,
      source_file,
      source_line,
      correlation_key,
      dedup_key
    ) VALUES (
      @id,
      @session_id,
      @tool_name,
      @command,
      @status,
      @start_ts,
      @end_ts,
      @duration_ms,
      @exit_code,
      @error,
      @stdout_bytes,
      @stderr_bytes,
      @source_file,
      @source_line,
      @correlation_key,
      @dedup_key
    )`
  )

  let changes = 0
  const runInsert = () => {
    for (const record of records) {
      const payload = {
        ...record,
        id: record.id ?? record.dedup_key,
      }
      const result = stmt.run(payload)
      changes += result?.changes ?? 0
    }
  }

  if (db.transaction) {
    db.transaction(runInsert)()
  } else {
    runInsert()
  }

  return changes
}

export function getToolCallSuccessRate(db: DbLike, range?: DateRange): number {
  const { clause, params } = buildRangeClause(range, 'start_ts')
  const row = db
    .prepare(
      `SELECT
        SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS okCount,
        COUNT(*) AS totalCount
       FROM tool_call
       WHERE 1=1${clause}`
    )
    .get(...params) as { okCount?: number; totalCount?: number }

  const ok = row?.okCount ?? 0
  const total = row?.totalCount ?? 0
  if (!total) return 0
  return ok / total
}

export function getAverageToolCallDuration(db: DbLike, range?: DateRange): number {
  const { clause, params } = buildRangeClause(range, 'start_ts')
  const row = db
    .prepare(
      `SELECT AVG(duration_ms) AS avgDuration
       FROM tool_call
       WHERE duration_ms IS NOT NULL${clause}`
    )
    .get(...params) as { avgDuration?: number }

  return row?.avgDuration ?? 0
}

export function getToolCallsByStatus(db: DbLike): Record<ToolCallStatus, number> {
  const rows = db
    .prepare(
      `SELECT status, COUNT(*) as count
       FROM tool_call
       GROUP BY status`
    )
    .all() as Array<{ status: ToolCallStatus; count: number }>

  const result: Record<ToolCallStatus, number> = {
    ok: 0,
    failed: 0,
    unknown: 0,
  }

  for (const row of rows) {
    if (row.status in result) {
      result[row.status] = row.count
    }
  }

  return result
}

export function getTopFailingCommands(
  db: DbLike,
  limit: number,
  range?: DateRange
): Array<{ command: string; failCount: number; lastError: string | null }> {
  const { clause, params } = buildRangeClause(range, 't.start_ts')
  const { clause: subClause, params: subParams } = buildRangeClause(range, 't2.start_ts')

  const rows = db
    .prepare(
      `SELECT
        t.command AS command,
        COUNT(*) AS failCount,
        (
          SELECT t2.error
          FROM tool_call t2
          WHERE t2.command = t.command
            AND t2.status = 'failed'
            ${subClause}
          ORDER BY t2.start_ts DESC
          LIMIT 1
        ) AS lastError
       FROM tool_call t
       WHERE t.status = 'failed'
         AND t.command IS NOT NULL${clause}
       GROUP BY t.command
       ORDER BY failCount DESC, MAX(t.start_ts) DESC
       LIMIT ?`
    )
    .all(...params, ...subParams, limit) as Array<{
    command: string
    failCount: number
    lastError: string | null
  }>

  return rows
}

function buildRangeClause(
  range: DateRange | undefined,
  column: string
): { clause: string; params: unknown[] } {
  if (!range) return { clause: '', params: [] }
  const clauses: string[] = []
  const params: unknown[] = []
  if (typeof range.start === 'number') {
    clauses.push(`${column} >= ?`)
    params.push(range.start)
  }
  if (typeof range.end === 'number') {
    clauses.push(`${column} <= ?`)
    params.push(range.end)
  }
  return {
    clause: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
    params,
  }
}
