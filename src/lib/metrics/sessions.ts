import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'

export interface SessionsListOptions {
  range: DateRange
  search?: string | null
  models?: string[]
  providers?: string[]
  project?: string | null
  branch?: string | null
  worktree?: string | null
  originator?: string | null
  cliVersion?: string | null
  pagination: Pagination
}

export interface SessionListItem {
  id: string
  ts: number
  cwd: string | null
  originator: string | null
  cliVersion: string | null
  modelProvider: string | null
  gitBranch: string | null
  gitCommit: string | null
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

export interface SessionsListResult {
  total: number
  sessions: SessionListItem[]
}

function buildWhere(options: SessionsListOptions, hasModelCall: boolean) {
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('s.ts', options.range, where, params)

  if (options.search) {
    const term = `%${options.search}%`
    where.push(
      '(s.cwd LIKE ? OR s.originator LIKE ? OR s.git_branch LIKE ? OR s.git_commit LIKE ?)'
    )
    params.push(term, term, term, term)
  }

  if (options.providers && options.providers.length > 0) {
    where.push(`s.model_provider IN (${options.providers.map(() => '?').join(',')})`)
    params.push(...options.providers)
  }

  if (options.models && options.models.length > 0) {
    if (!hasModelCall) {
      return { where: ['1 = 0'], params: [] }
    }
    where.push(
      `EXISTS (SELECT 1 FROM model_call mc2 WHERE mc2.session_id = s.id AND mc2.model IN (${options.models
        .map(() => '?')
        .join(',')}))`
    )
    params.push(...options.models)
  }

  if (options.project) {
    where.push('s.project_id = ?')
    params.push(options.project)
  }

  if (options.branch) {
    where.push('s.git_branch = ?')
    params.push(options.branch)
  }

  if (options.worktree) {
    where.push('s.project_ref_id = ?')
    params.push(options.worktree)
  }

  if (options.originator) {
    where.push('s.originator = ?')
    params.push(options.originator)
  }

  if (options.cliVersion) {
    where.push('s.cli_version = ?')
    params.push(options.cliVersion)
  }

  return { where, params }
}

export function getSessionsList(options: SessionsListOptions): SessionsListResult {
  const db = getDatabase()
  if (!tableExists(db, 'session')) {
    return { total: 0, sessions: [] }
  }

  const hasMessage = tableExists(db, 'message')
  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const { where, params } = buildWhere(options, hasModelCall)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM session s ${whereSql}`)
    .get(...params) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const messageCountSql = hasMessage
    ? '(SELECT COUNT(*) FROM message m WHERE m.session_id = s.id)'
    : '0'
  const modelCallCountSql = hasModelCall
    ? '(SELECT COUNT(*) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const toolCallCountSql = hasToolCall
    ? '(SELECT COUNT(*) FROM tool_call tc WHERE tc.session_id = s.id)'
    : '0'

  const inputTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(input_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const cachedInputTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(cached_input_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const outputTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(output_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const reasoningTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(reasoning_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const totalTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(total_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'

  const avgModelDurationSql = hasModelCall
    ? '(SELECT COALESCE(AVG(duration_ms), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const avgToolDurationSql = hasToolCall
    ? '(SELECT COALESCE(AVG(duration_ms), 0) FROM tool_call tc WHERE tc.session_id = s.id)'
    : '0'

  const toolOkSql = hasToolCall
    ? "(SELECT COALESCE(SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END), 0) FROM tool_call tc WHERE tc.session_id = s.id)"
    : '0'

  const firstModelSql = hasModelCall
    ? '(SELECT MIN(ts) FROM model_call mc WHERE mc.session_id = s.id)'
    : 'NULL'
  const lastModelSql = hasModelCall
    ? '(SELECT MAX(ts) FROM model_call mc WHERE mc.session_id = s.id)'
    : 'NULL'
  const firstMessageSql = hasMessage
    ? '(SELECT MIN(ts) FROM message m WHERE m.session_id = s.id)'
    : 'NULL'
  const lastMessageSql = hasMessage
    ? '(SELECT MAX(ts) FROM message m WHERE m.session_id = s.id)'
    : 'NULL'
  const firstToolSql = hasToolCall
    ? '(SELECT MIN(start_ts) FROM tool_call tc WHERE tc.session_id = s.id)'
    : 'NULL'
  const lastToolSql = hasToolCall
    ? '(SELECT MAX(COALESCE(end_ts, start_ts)) FROM tool_call tc WHERE tc.session_id = s.id)'
    : 'NULL'

  const rows = db
    .prepare(
      `SELECT
        s.id,
        s.ts,
        s.cwd,
        s.originator,
        s.cli_version,
        s.model_provider,
        s.git_branch,
        s.git_commit,
        ${messageCountSql} AS message_count,
        ${modelCallCountSql} AS model_call_count,
        ${toolCallCountSql} AS tool_call_count,
        ${inputTokensSql} AS input_tokens,
        ${cachedInputTokensSql} AS cached_input_tokens,
        ${outputTokensSql} AS output_tokens,
        ${reasoningTokensSql} AS reasoning_tokens,
        ${totalTokensSql} AS total_tokens,
        ${avgModelDurationSql} AS avg_model_duration_ms,
        ${avgToolDurationSql} AS avg_tool_duration_ms,
        ${toolOkSql} AS tool_ok_count,
        ${firstModelSql} AS first_model_ts,
        ${lastModelSql} AS last_model_ts,
        ${firstMessageSql} AS first_message_ts,
        ${lastMessageSql} AS last_message_ts,
        ${firstToolSql} AS first_tool_ts,
        ${lastToolSql} AS last_tool_ts
      FROM session s
      ${whereSql}
      ORDER BY s.ts DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, options.pagination.limit, options.pagination.offset) as Record<
    string,
    unknown
  >[]

  const sessions = rows.map((row) => {
    const inputTokens = toNumber(row.input_tokens)
    const cachedInputTokens = toNumber(row.cached_input_tokens)
    const toolCallCount = toNumber(row.tool_call_count)
    const toolOkCount = toNumber(row.tool_ok_count)

    const startCandidates = [
      toNumber(row.first_model_ts, Number.NaN),
      toNumber(row.first_message_ts, Number.NaN),
      toNumber(row.first_tool_ts, Number.NaN),
    ].filter((value) => Number.isFinite(value))
    const endCandidates = [
      toNumber(row.last_model_ts, Number.NaN),
      toNumber(row.last_message_ts, Number.NaN),
      toNumber(row.last_tool_ts, Number.NaN),
    ].filter((value) => Number.isFinite(value))

    let durationMs: number | null = null
    if (startCandidates.length > 0 && endCandidates.length > 0) {
      const start = Math.min(...startCandidates)
      const end = Math.max(...endCandidates)
      durationMs = end >= start ? end - start : null
    }

    return {
      id: String(row.id ?? ''),
      ts: toNumber(row.ts),
      cwd: (row.cwd as string | null) ?? null,
      originator: (row.originator as string | null) ?? null,
      cliVersion: (row.cli_version as string | null) ?? null,
      modelProvider: (row.model_provider as string | null) ?? null,
      gitBranch: (row.git_branch as string | null) ?? null,
      gitCommit: (row.git_commit as string | null) ?? null,
      messageCount: toNumber(row.message_count),
      modelCallCount: toNumber(row.model_call_count),
      toolCallCount,
      tokens: {
        input: inputTokens,
        cachedInput: cachedInputTokens,
        output: toNumber(row.output_tokens),
        reasoning: toNumber(row.reasoning_tokens),
        total: toNumber(row.total_tokens),
        cacheHitRate: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
      },
      avgModelDurationMs: toNumber(row.avg_model_duration_ms),
      avgToolDurationMs: toNumber(row.avg_tool_duration_ms),
      successRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
      durationMs,
    } satisfies SessionListItem
  })

  return { total, sessions }
}
