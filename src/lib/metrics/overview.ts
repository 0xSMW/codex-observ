import { computeCost, getPricingForModel } from '@/lib/pricing'
import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange, getPreviousRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { safeAll, safeGet } from './query-helpers'

type KpiValue = {
  value: number
  previous: number | null
  delta: number | null
  deltaPct: number | null
}

export interface OverviewSeriesPoint {
  date: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
  totalTokens: number
  modelCalls: number
  cacheHitRate: number
  estimatedCost: number
}

export interface OverviewResponse {
  kpis: {
    totalTokens: KpiValue
    cacheHitRate: KpiValue
    sessions: KpiValue
    modelCalls: KpiValue
    toolCalls: KpiValue
    successRate: KpiValue
    totalCost: KpiValue
    avgModelDurationMs: KpiValue
    avgToolDurationMs: KpiValue
  }
  series: {
    daily: OverviewSeriesPoint[]
  }
}

function kpi(value: number, previous: number | null): KpiValue {
  if (previous === null) {
    return { value, previous, delta: null, deltaPct: null }
  }
  const delta = value - previous
  const deltaPct = previous === 0 ? null : delta / previous
  return { value, previous, delta, deltaPct }
}

function queryTokenTotals(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  project?: string | null
) {
  const fallback = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    modelCalls: 0,
    avgDurationMs: 0,
  }

  return safeGet(
    'model_call',
    (db) => {
      if (project && !tableExists(db, 'session')) {
        return fallback
      }

      const where: string[] = []
      const params: unknown[] = []
      applyDateRange('mc.ts', range, where, params)
      if (project) {
        where.push('s.project_id = ?')
        params.push(project)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const joinSql = project ? 'JOIN session s ON s.id = mc.session_id' : ''

      // Infer duration from next model call in same session when duration_ms is null (matches session-detail logic)
      const row = db
        .prepare(
          `WITH with_next AS (
        SELECT
          mc.input_tokens,
          mc.cached_input_tokens,
          mc.output_tokens,
          mc.reasoning_tokens,
          mc.total_tokens,
          mc.duration_ms,
          mc.ts AS ts,
          LEAD(mc.ts) OVER (PARTITION BY mc.session_id ORDER BY mc.ts) AS next_ts
        FROM model_call mc
        ${joinSql}
        ${whereSql}
      )
      SELECT
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*) AS model_calls,
        COALESCE(AVG(CASE
          WHEN duration_ms IS NOT NULL AND duration_ms > 0 THEN duration_ms
          WHEN next_ts IS NOT NULL AND next_ts > ts THEN next_ts - ts
          ELSE NULL
        END), 0) AS avg_duration_ms
      FROM with_next`
        )
        .get(...params) as Record<string, unknown> | undefined

      return {
        inputTokens: toNumber(row?.input_tokens),
        cachedInputTokens: toNumber(row?.cached_input_tokens),
        outputTokens: toNumber(row?.output_tokens),
        reasoningTokens: toNumber(row?.reasoning_tokens),
        totalTokens: toNumber(row?.total_tokens),
        modelCalls: toNumber(row?.model_calls),
        avgDurationMs: toNumber(row?.avg_duration_ms),
      }
    },
    fallback
  )
}

function querySessionsCount(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  project?: string | null
): number {
  return safeGet(
    'session',
    (db) => {
      const where: string[] = []
      const params: unknown[] = []
      applyDateRange('ts', range, where, params)
      if (project) {
        where.push('project_id = ?')
        params.push(project)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const row = db
        .prepare(`SELECT COUNT(*) AS sessions FROM session ${whereSql}`)
        .get(...params) as Record<string, unknown> | undefined
      return toNumber(row?.sessions)
    },
    0
  )
}

function queryToolSummary(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  project?: string | null
) {
  const fallback = { toolCalls: 0, okCalls: 0, avgDurationMs: 0 }

  return safeGet(
    'tool_call',
    (db) => {
      if (project && !tableExists(db, 'session')) {
        return fallback
      }

      const where: string[] = []
      const params: unknown[] = []
      applyDateRange('tc.start_ts', range, where, params)
      if (project) {
        where.push('s.project_id = ?')
        params.push(project)
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const joinSql = project ? 'JOIN session s ON s.id = tc.session_id' : ''

      // Use end_ts - start_ts when duration_ms is null (matches session-detail logic)
      const row = db
        .prepare(
          `SELECT
        COUNT(*) AS tool_calls,
        SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_calls,
        COALESCE(AVG(CASE
          WHEN duration_ms IS NOT NULL AND duration_ms > 0 THEN duration_ms
          WHEN end_ts IS NOT NULL AND start_ts IS NOT NULL AND end_ts >= start_ts THEN (end_ts - start_ts)
          ELSE NULL
        END), 0) AS avg_duration_ms
      FROM tool_call tc
      ${joinSql}
      ${whereSql}`
        )
        .get(...params) as Record<string, unknown> | undefined

      return {
        toolCalls: toNumber(row?.tool_calls),
        okCalls: toNumber(row?.ok_calls),
        avgDurationMs: toNumber(row?.avg_duration_ms),
      }
    },
    fallback
  )
}

function queryDailySeries(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  pricingData: Record<string, unknown> | null,
  project?: string | null
): OverviewSeriesPoint[] {
  const rows = safeAll('model_call', (db) => {
    if (project && !tableExists(db, 'session')) {
      return []
    }

    const where: string[] = []
    const params: unknown[] = []
    applyDateRange('mc.ts', range, where, params)
    if (project) {
      where.push('s.project_id = ?')
      params.push(project)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const joinSql = project ? 'JOIN session s ON s.id = mc.session_id' : ''

    return db
      .prepare(
        `SELECT
        strftime('%Y-%m-%d', mc.ts / 1000, 'unixepoch', 'localtime') AS date,
        mc.model,
        COALESCE(mc.input_tokens, 0) AS input_tokens,
        COALESCE(mc.cached_input_tokens, 0) AS cached_input_tokens,
        COALESCE(mc.output_tokens, 0) AS output_tokens,
        COALESCE(mc.reasoning_tokens, 0) AS reasoning_tokens
      FROM model_call mc
      ${joinSql}
      ${whereSql}
      ORDER BY date ASC`
      )
      .all(...params) as Record<string, unknown>[]
  })

  const byDate = new Map<
    string,
    {
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      reasoningTokens: number
      totalTokens: number
      modelCalls: number
      cost: number
    }
  >()

  for (const row of rows) {
    const date = String(row.date ?? '')
    let entry = byDate.get(date)
    if (!entry) {
      entry = {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
        modelCalls: 0,
        cost: 0,
      }
      byDate.set(date, entry)
    }
    const inputTokens = toNumber(row.input_tokens)
    const cachedInputTokens = toNumber(row.cached_input_tokens)
    const outputTokens = toNumber(row.output_tokens)
    const reasoningTokens = toNumber(row.reasoning_tokens)
    entry.inputTokens += inputTokens
    entry.cachedInputTokens += cachedInputTokens
    entry.outputTokens += outputTokens
    entry.reasoningTokens += reasoningTokens
    entry.totalTokens += inputTokens + outputTokens + reasoningTokens
    entry.modelCalls += 1
    const model = row.model != null ? String(row.model) : null
    const pricing = getPricingForModel(
      pricingData as Parameters<typeof getPricingForModel>[0],
      model
    )
    const cost = computeCost(pricing, inputTokens, cachedInputTokens, outputTokens, reasoningTokens)
    if (cost !== null) entry.cost += cost
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => {
      const cacheHitRate = entry.inputTokens > 0 ? entry.cachedInputTokens / entry.inputTokens : 0
      return {
        date,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        outputTokens: entry.outputTokens,
        reasoningTokens: entry.reasoningTokens,
        totalTokens: entry.totalTokens,
        modelCalls: entry.modelCalls,
        cacheHitRate,
        estimatedCost: entry.cost,
      }
    })
}

export interface GetOverviewOptions {
  range: DateRange
  project?: string | null
  pricingData?: Record<string, unknown> | null
}

export function getOverview(options: GetOverviewOptions): OverviewResponse {
  const range = options.range
  const pricingData = options.pricingData ?? null
  const project = options.project ?? null

  const db = getDatabase()
  const currentTokens = queryTokenTotals(db, range, project)
  const currentSessions = querySessionsCount(db, range, project)
  const currentTools = queryToolSummary(db, range, project)
  const dailySeries = queryDailySeries(db, range, pricingData, project)

  const totalCost = dailySeries.reduce((sum, p) => sum + p.estimatedCost, 0)

  const prevRange = getPreviousRange(range)
  const prevTokens = prevRange ? queryTokenTotals(db, prevRange, project) : null
  const prevSessions = prevRange ? querySessionsCount(db, prevRange, project) : null
  const prevTools = prevRange ? queryToolSummary(db, prevRange, project) : null
  const prevDaily = prevRange ? queryDailySeries(db, prevRange, pricingData, project) : []
  const prevTotalCost = prevDaily.reduce((sum, p) => sum + p.estimatedCost, 0)

  const cacheHitRate =
    currentTokens.inputTokens > 0 ? currentTokens.cachedInputTokens / currentTokens.inputTokens : 0
  const prevCacheHitRate =
    prevTokens && prevTokens.inputTokens > 0
      ? prevTokens.cachedInputTokens / prevTokens.inputTokens
      : null

  const successRate = currentTools.toolCalls > 0 ? currentTools.okCalls / currentTools.toolCalls : 0
  const prevSuccessRate =
    prevTools && prevTools.toolCalls > 0 ? prevTools.okCalls / prevTools.toolCalls : null

  return {
    kpis: {
      totalTokens: kpi(currentTokens.totalTokens, prevTokens?.totalTokens ?? null),
      cacheHitRate: kpi(cacheHitRate, prevCacheHitRate),
      sessions: kpi(currentSessions, prevSessions),
      modelCalls: kpi(currentTokens.modelCalls, prevTokens?.modelCalls ?? null),
      toolCalls: kpi(currentTools.toolCalls, prevTools?.toolCalls ?? null),
      successRate: kpi(successRate, prevSuccessRate),
      totalCost: kpi(totalCost, prevRange ? prevTotalCost : null),
      avgModelDurationMs: kpi(currentTokens.avgDurationMs, prevTokens?.avgDurationMs ?? null),
      avgToolDurationMs: kpi(currentTools.avgDurationMs, prevTools?.avgDurationMs ?? null),
    },
    series: {
      daily: dailySeries,
    },
  }
}
