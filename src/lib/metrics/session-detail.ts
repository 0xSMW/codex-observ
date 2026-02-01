import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'

export interface SessionRecord {
  id: string
  ts: number
  cwd: string | null
  originator: string | null
  cliVersion: string | null
  modelProvider: string | null
  gitBranch: string | null
  gitCommit: string | null
  sourceFile: string | null
  sourceLine: number | null
}

export interface SessionStats {
  messageCount: number
  modelCallCount: number
  toolCallCount: number
  tokens: {
    input: number
    cachedInput: number
    output: number
    reasoning: number
    total: number
    cacheHitRate: number
  }
  avgModelDurationMs: number
  avgToolDurationMs: number
  successRate: number
  durationMs: number | null
}

export interface MessageItem {
  id: string
  ts: number
  role: string
  content: string | null
}

export interface ModelCallItem {
  id: string
  ts: number
  model: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  durationMs: number | null
}

export interface ToolCallItem {
  id: string
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

export interface ListResult<T> {
  total: number
  items: T[]
}

export interface SessionDetailResult {
  session: SessionRecord | null
  stats: SessionStats | null
  messages: ListResult<MessageItem>
  modelCalls: ListResult<ModelCallItem>
  toolCalls: ListResult<ToolCallItem>
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return fallback
}

function buildRange(field: string, range: DateRange, where: string[], params: unknown[]) {
  applyDateRange(field, range, where, params)
}

export function getSessionDetail(
  sessionId: string,
  range: DateRange,
  messagePagination: Pagination,
  modelPagination: Pagination,
  toolPagination: Pagination
): SessionDetailResult {
  const db = getDatabase()
  if (!tableExists(db, 'session')) {
    return {
      session: null,
      stats: null,
      messages: { total: 0, items: [] },
      modelCalls: { total: 0, items: [] },
      toolCalls: { total: 0, items: [] },
    }
  }

  const sessionRow = db
    .prepare(
      `SELECT id, ts, cwd, originator, cli_version, model_provider, git_branch, git_commit, source_file, source_line
      FROM session WHERE id = ?`
    )
    .get(sessionId) as Record<string, unknown> | undefined

  if (!sessionRow) {
    return {
      session: null,
      stats: null,
      messages: { total: 0, items: [] },
      modelCalls: { total: 0, items: [] },
      toolCalls: { total: 0, items: [] },
    }
  }

  const session: SessionRecord = {
    id: String(sessionRow.id ?? ''),
    ts: toNumber(sessionRow.ts),
    cwd: (sessionRow.cwd as string | null) ?? null,
    originator: (sessionRow.originator as string | null) ?? null,
    cliVersion: (sessionRow.cli_version as string | null) ?? null,
    modelProvider: (sessionRow.model_provider as string | null) ?? null,
    gitBranch: (sessionRow.git_branch as string | null) ?? null,
    gitCommit: (sessionRow.git_commit as string | null) ?? null,
    sourceFile: (sessionRow.source_file as string | null) ?? null,
    sourceLine: sessionRow.source_line ? toNumber(sessionRow.source_line) : null,
  }

  const hasMessage = tableExists(db, 'message')
  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const statsWhereMessage: string[] = ['session_id = ?']
  const statsWhereModel: string[] = ['session_id = ?']
  const statsParamsMessage: unknown[] = [sessionId]
  const statsParamsModel: unknown[] = [sessionId]

  buildRange('ts', range, statsWhereMessage, statsParamsMessage)
  buildRange('ts', range, statsWhereModel, statsParamsModel)

  const messageCount = hasMessage
    ? toNumber(
        (
          db
            .prepare(
              `SELECT COUNT(*) AS count FROM message WHERE ${statsWhereMessage.join(' AND ')}`
            )
            .get(...statsParamsMessage) as { count: number } | undefined
        )?.count
      )
    : 0

  const modelRow = hasModelCall
    ? (db
        .prepare(
          `SELECT
            COUNT(*) AS count,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(AVG(duration_ms), 0) AS avg_duration_ms,
            MIN(ts) AS first_ts,
            MAX(ts) AS last_ts
          FROM model_call
          WHERE ${statsWhereModel.join(' AND ')}`
        )
        .get(...statsParamsModel) as Record<string, unknown> | undefined)
    : undefined

  // Session activity window: tool_calls from log ingest have session_id NULL; include those
  // whose start_ts falls in this session's window. Log timestamps may be local vs UTC so use
  // a generous window (session start - 24h to session end + 1h).
  const sessionTs = session.ts
  const modelFirstTs = modelRow ? toNumber(modelRow.first_ts) : null
  const modelLastTs = modelRow ? toNumber(modelRow.last_ts) : null
  const sessionEnd =
    modelLastTs !== null ? Math.max(sessionTs, modelLastTs) : sessionTs + 24 * 60 * 60 * 1000
  const windowStart = (modelFirstTs !== null ? Math.min(sessionTs, modelFirstTs) : sessionTs) - 24 * 60 * 60 * 1000
  const windowEnd = sessionEnd + 60 * 60 * 1000
  const statsWhereTool: string[] = [
    '(session_id = ? OR (session_id IS NULL AND start_ts >= ? AND start_ts <= ?))',
  ]
  const statsParamsTool: unknown[] = [sessionId, windowStart, windowEnd]
  buildRange('start_ts', range, statsWhereTool, statsParamsTool)

  const toolRow = hasToolCall
    ? (db
        .prepare(
          `SELECT
            COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END), 0) AS ok_count,
            COALESCE(AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms WHEN end_ts IS NOT NULL AND start_ts IS NOT NULL THEN (end_ts - start_ts) ELSE NULL END), 0) AS avg_duration_ms,
            MIN(start_ts) AS first_ts,
            MAX(COALESCE(end_ts, start_ts)) AS last_ts
          FROM tool_call
          WHERE ${statsWhereTool.join(' AND ')}`
        )
        .get(...statsParamsTool) as Record<string, unknown> | undefined)
    : undefined

  const inputTokens = toNumber(modelRow?.input_tokens)
  const cachedInputTokens = toNumber(modelRow?.cached_input_tokens)
  const toolCallCount = toNumber(toolRow?.count)
  const toolOkCount = toNumber(toolRow?.ok_count)

  const startCandidates = [
    toNumber(modelRow?.first_ts, Number.NaN),
    toNumber(toolRow?.first_ts, Number.NaN),
  ].filter((value) => Number.isFinite(value))
  const endCandidates = [
    toNumber(modelRow?.last_ts, Number.NaN),
    toNumber(toolRow?.last_ts, Number.NaN),
  ].filter((value) => Number.isFinite(value))

  let durationMs: number | null = null
  if (startCandidates.length > 0 && endCandidates.length > 0) {
    const start = Math.min(...startCandidates)
    const end = Math.max(...endCandidates)
    durationMs = end >= start ? end - start : null
  }

  const stats: SessionStats = {
    messageCount,
    modelCallCount: toNumber(modelRow?.count),
    toolCallCount,
    tokens: {
      input: inputTokens,
      cachedInput: cachedInputTokens,
      output: toNumber(modelRow?.output_tokens),
      reasoning: toNumber(modelRow?.reasoning_tokens),
      total: toNumber(modelRow?.total_tokens),
      cacheHitRate: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
    },
    avgModelDurationMs: toNumber(modelRow?.avg_duration_ms),
    avgToolDurationMs: toNumber(toolRow?.avg_duration_ms),
    successRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
    durationMs,
  }

  const messages: ListResult<MessageItem> = { total: 0, items: [] }
  if (hasMessage) {
    const where: string[] = ['session_id = ?']
    const params: unknown[] = [sessionId]
    buildRange('ts', range, where, params)
    const whereSql = where.join(' AND ')
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM message WHERE ${whereSql}`)
      .get(...params) as Record<string, unknown> | undefined
    messages.total = toNumber(countRow?.total)
    const rows = db
      .prepare(
        `SELECT id, ts, role, content FROM message WHERE ${whereSql} ORDER BY ts ASC LIMIT ? OFFSET ?`
      )
      .all(...params, messagePagination.limit, messagePagination.offset) as Record<
      string,
      unknown
    >[]
    messages.items = rows.map((row) => ({
      id: String(row.id ?? ''),
      ts: toNumber(row.ts),
      role: String(row.role ?? ''),
      content: (row.content as string | null) ?? null,
    }))
  }

  const modelCalls: ListResult<ModelCallItem> = { total: 0, items: [] }
  if (hasModelCall) {
    const where: string[] = ['session_id = ?']
    const params: unknown[] = [sessionId]
    buildRange('ts', range, where, params)
    const whereSql = where.join(' AND ')
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM model_call WHERE ${whereSql}`)
      .get(...params) as Record<string, unknown> | undefined
    modelCalls.total = toNumber(countRow?.total)
    const rows = db
      .prepare(
        `SELECT id, ts, model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens, duration_ms
        FROM model_call
        WHERE ${whereSql}
        ORDER BY ts ASC
        LIMIT ? OFFSET ?`
      )
      .all(...params, modelPagination.limit, modelPagination.offset) as Record<string, unknown>[]
    modelCalls.items = rows.map((row, index) => {
      const ts = toNumber(row.ts)
      let durationMs: number | null = row.duration_ms === null ? null : toNumber(row.duration_ms)
      if (durationMs === null && index + 1 < rows.length) {
        const nextTs = toNumber(rows[index + 1]?.ts)
        if (Number.isFinite(nextTs) && nextTs > ts) durationMs = nextTs - ts
      }
      return {
        id: String(row.id ?? ''),
        ts,
        model: (row.model as string | null) ?? null,
        inputTokens: toNumber(row.input_tokens),
        cachedInputTokens: toNumber(row.cached_input_tokens),
        outputTokens: toNumber(row.output_tokens),
        reasoningTokens: toNumber(row.reasoning_tokens),
        totalTokens: toNumber(row.total_tokens),
        durationMs,
      }
    })
  }

  const toolCalls: ListResult<ToolCallItem> = { total: 0, items: [] }
  if (hasToolCall) {
    const where: string[] = [
      '(session_id = ? OR (session_id IS NULL AND start_ts >= ? AND start_ts <= ?))',
    ]
    const params: unknown[] = [sessionId, windowStart, windowEnd]
    buildRange('start_ts', range, where, params)
    const whereSql = where.join(' AND ')
    const countRow = db
      .prepare(`SELECT COUNT(*) AS total FROM tool_call WHERE ${whereSql}`)
      .get(...params) as Record<string, unknown> | undefined
    toolCalls.total = toNumber(countRow?.total)
    const rows = db
      .prepare(
        `SELECT id, tool_name, command, status, start_ts, end_ts, duration_ms, exit_code, error, stdout_bytes, stderr_bytes, correlation_key
        FROM tool_call
        WHERE ${whereSql}
        ORDER BY start_ts ASC
        LIMIT ? OFFSET ?`
      )
      .all(...params, toolPagination.limit, toolPagination.offset) as Record<string, unknown>[]
    toolCalls.items = rows.map((row) => {
      const startTs = toNumber(row.start_ts)
      const endTs = row.end_ts === null ? null : toNumber(row.end_ts)
      let durationMs: number | null = row.duration_ms === null ? null : toNumber(row.duration_ms)
      if (durationMs === null && startTs !== null && endTs !== null) {
        durationMs = endTs - startTs
      }
      return {
        id: String(row.id ?? ''),
        toolName: String(row.tool_name ?? ''),
        command: (row.command as string | null) ?? null,
        status: String(row.status ?? 'unknown'),
        startTs,
        endTs,
        durationMs,
        exitCode: row.exit_code === null ? null : toNumber(row.exit_code),
        error: (row.error as string | null) ?? null,
      stdoutBytes: row.stdout_bytes === null ? null : toNumber(row.stdout_bytes),
      stderrBytes: row.stderr_bytes === null ? null : toNumber(row.stderr_bytes),
      correlationKey: (row.correlation_key as string | null) ?? null,
      }
    })
  }

  return {
    session,
    stats,
    messages,
    modelCalls,
    toolCalls,
  }
}
