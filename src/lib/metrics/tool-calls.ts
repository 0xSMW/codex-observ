import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange, getPreviousRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { safeGet } from './query-helpers'
import { Pagination } from './pagination'

export interface ToolCallsListOptions {
  range: DateRange
  pagination: Pagination
  status?: string[]
  tools?: string[]
  sessionId?: string | null
  search?: string | null
  exitCode?: number | null
  hasError?: boolean | null
  minDurationMs?: number | null
  maxDurationMs?: number | null
  project?: string | null
}

export interface ToolCallListItem {
  id: string
  sessionId: string | null
  toolName: string
  command: string | null
  status: string
  startTs: number
  endTs: number | null
  durationMs: number | null
  exitCode: number | null
  error: string | null
  stdoutBytes: number | null
  stderrBytes: number | null
  correlationKey: string | null
}

export interface ToolCallSummary {
  total: number
  ok: number
  failed: number
  unknown: number
  avgDurationMs: number
  successRate: number
  prevTotal: number | null
  prevOk: number | null
  prevFailed: number | null
  prevUnknown: number | null
  prevAvgDurationMs: number | null
  prevSuccessRate: number | null
}

export interface ToolCallsListResult {
  total: number
  toolCalls: ToolCallListItem[]
  summary: ToolCallSummary
  breakdown: {
    tools: ToolBreakdown[]
    failures: FailureBreakdown[]
  }
}

function buildWhere(options: ToolCallsListOptions, range: DateRange) {
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('start_ts', range, where, params)

  if (options.sessionId) {
    where.push('session_id = ?')
    params.push(options.sessionId)
  }

  if (options.status && options.status.length > 0) {
    where.push(`status IN (${options.status.map(() => '?').join(',')})`)
    params.push(...options.status)
  }

  if (options.tools && options.tools.length > 0) {
    where.push(`tool_name IN (${options.tools.map(() => '?').join(',')})`)
    params.push(...options.tools)
  }

  if (options.search) {
    where.push('command LIKE ?')
    params.push(`%${options.search}%`)
  }

  if (options.exitCode !== undefined && options.exitCode !== null) {
    where.push('exit_code = ?')
    params.push(options.exitCode)
  }

  if (options.hasError === true) {
    where.push('error IS NOT NULL AND error != ?')
    params.push('')
  }

  if (options.minDurationMs !== undefined && options.minDurationMs !== null) {
    where.push('duration_ms >= ?')
    params.push(options.minDurationMs)
  }

  if (options.maxDurationMs !== undefined && options.maxDurationMs !== null) {
    where.push('duration_ms <= ?')
    params.push(options.maxDurationMs)
  }

  if (options.project) {
    where.push('session_id IN (SELECT id FROM session WHERE project_id = ?)')
    params.push(options.project)
  }

  return { where, params }
}

function querySummary(
  db: ReturnType<typeof getDatabase>,
  options: ToolCallsListOptions,
  range: DateRange
) {
  return safeGet(
    'tool_call',
    (db) => {
      const { where, params } = buildWhere(options, range)
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

      const row = db
        .prepare(
          `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_count,
        SUM(CASE WHEN status = 'failed' OR (exit_code IS NOT NULL AND exit_code != 0) THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
      FROM tool_call
      ${whereSql}`
        )
        .get(...params) as Record<string, unknown> | undefined

      const total = toNumber(row?.total)
      const ok = toNumber(row?.ok_count)

      return {
        total,
        ok,
        failed: toNumber(row?.failed_count),
        unknown: toNumber(row?.unknown_count),
        avgDurationMs: toNumber(row?.avg_duration_ms),
        successRate: total > 0 ? ok / total : 0,
      }
    },
    null
  )
}

export function getToolCallsList(options: ToolCallsListOptions): ToolCallsListResult {
  const db = getDatabase()

  const currentSummary = querySummary(db, options, options.range) ?? {
    total: 0,
    ok: 0,
    failed: 0,
    unknown: 0,
    avgDurationMs: 0,
    successRate: 0,
  }

  const prevRange = getPreviousRange(options.range)
  const prevSummary = prevRange ? querySummary(db, options, prevRange) : null

  // Fetch list items
  const { where, params } = buildWhere(options, options.range)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  let total = 0
  let toolCalls: ToolCallListItem[] = []

  if (tableExists(db, 'tool_call')) {
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS total FROM tool_call ${whereSql}`)
      .get(...params) as Record<string, unknown> | undefined
    total = toNumber(totalRow?.total)

    const rows = db
      .prepare(
        `SELECT id, session_id, tool_name, command, status, start_ts, end_ts, duration_ms, exit_code, error, stdout_bytes, stderr_bytes, correlation_key
        FROM tool_call
        ${whereSql}
        ORDER BY start_ts DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, options.pagination.limit, options.pagination.offset) as Record<
      string,
      unknown
    >[]

    toolCalls = rows.map((row) => ({
      id: String(row.id ?? ''),
      sessionId: (row.session_id as string | null) ?? null,
      toolName: String(row.tool_name ?? ''),
      command: (row.command as string | null) ?? null,
      status: String(row.status ?? 'unknown'),
      startTs: toNumber(row.start_ts),
      endTs: row.end_ts === null ? null : toNumber(row.end_ts),
      durationMs: row.duration_ms === null ? null : toNumber(row.duration_ms),
      exitCode: row.exit_code === null ? null : toNumber(row.exit_code),
      error: (row.error as string | null) ?? null,
      stdoutBytes: row.stdout_bytes === null ? null : toNumber(row.stdout_bytes),
      stderrBytes: row.stderr_bytes === null ? null : toNumber(row.stderr_bytes),
      correlationKey: (row.correlation_key as string | null) ?? null,
    }))
  }

  // Fetch breakdowns
  const breakdown: ToolCallsListResult['breakdown'] = { tools: [], failures: [] }

  if (tableExists(db, 'tool_call')) {
    const toolBreakdownRows = db
      .prepare(
        `
        SELECT 
          tool_name, 
          COUNT(*) as count,
          avg(duration_ms) as avg_dur,
          SUM(CASE WHEN status='ok' OR status='unknown' OR exit_code=0 THEN 1 ELSE 0 END) as success_count
        FROM tool_call
        ${whereSql}
        GROUP BY tool_name
        ORDER BY count DESC
        LIMIT 20
      `
      )
      .all(...params) as Record<string, unknown>[]

    const failureRows = db
      .prepare(
        `
        SELECT 
          error,
          MAX(tool_name) as tool_example,
          COUNT(*) as count
        FROM tool_call
        ${whereSql}
        AND (status = 'failed' OR (exit_code IS NOT NULL AND exit_code != 0))
        AND error IS NOT NULL AND error != ''
        GROUP BY error
        ORDER BY count DESC
        LIMIT 10
      `
      )
      .all(...params) as Record<string, unknown>[]

    breakdown.tools = toolBreakdownRows.map((row) => ({
      tool: String(row.tool_name),
      count: toNumber(row.count),
      avgDurationMs: toNumber(row.avg_dur),
      successRate: toNumber(row.count) > 0 ? toNumber(row.success_count) / toNumber(row.count) : 0,
    }))

    breakdown.failures = failureRows.map((row) => ({
      error: String(row.error),
      count: toNumber(row.count),
      tool: String(row.tool_example),
    }))
  }

  return {
    total,
    toolCalls,
    summary: {
      ...currentSummary,
      prevTotal: prevSummary?.total ?? null,
      prevOk: prevSummary?.ok ?? null,
      prevFailed: prevSummary?.failed ?? null,
      prevUnknown: prevSummary?.unknown ?? null,
      prevAvgDurationMs: prevSummary?.avgDurationMs ?? null,
      prevSuccessRate: prevSummary?.successRate ?? null,
    },
    breakdown,
  }
}

export interface ToolBreakdown {
  tool: string
  count: number
  successRate: number
  avgDurationMs: number
}

export interface FailureBreakdown {
  error: string
  count: number
  tool: string | null
}
