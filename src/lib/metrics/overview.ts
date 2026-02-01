import { computeCost, getPricingForModel } from '@/lib/pricing'
import { applyDateRange, DateRange, getPreviousRange } from './date-range'
import { getDatabase, tableExists } from './db'

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

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) {
    return fallback
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return fallback
}

function kpi(value: number, previous: number | null): KpiValue {
  if (previous === null) {
    return { value, previous, delta: null, deltaPct: null }
  }
  const delta = value - previous
  const deltaPct = previous === 0 ? null : delta / previous
  return { value, previous, delta, deltaPct }
}

function queryTokenTotals(db: ReturnType<typeof getDatabase>, range: DateRange) {
  if (!tableExists(db, 'model_call')) {
    return {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      modelCalls: 0,
      avgDurationMs: 0,
    }
  }
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*) AS model_calls,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
      FROM model_call
      ${whereSql}`
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
}

function querySessionsCount(db: ReturnType<typeof getDatabase>, range: DateRange): number {
  if (!tableExists(db, 'session')) {
    return 0
  }
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db.prepare(`SELECT COUNT(*) AS sessions FROM session ${whereSql}`).get(...params) as
    | Record<string, unknown>
    | undefined
  return toNumber(row?.sessions)
}

function queryToolSummary(db: ReturnType<typeof getDatabase>, range: DateRange) {
  if (!tableExists(db, 'tool_call')) {
    return { toolCalls: 0, okCalls: 0, avgDurationMs: 0 }
  }
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('start_ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS tool_calls,
        SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_calls,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
      FROM tool_call
      ${whereSql}`
    )
    .get(...params) as Record<string, unknown> | undefined

  return {
    toolCalls: toNumber(row?.tool_calls),
    okCalls: toNumber(row?.ok_calls),
    avgDurationMs: toNumber(row?.avg_duration_ms),
  }
}

function queryDailySeries(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  pricingData: Record<string, unknown> | null
): OverviewSeriesPoint[] {
  if (!tableExists(db, 'model_call')) {
    return []
  }
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
        model,
        COALESCE(input_tokens, 0) AS input_tokens,
        COALESCE(cached_input_tokens, 0) AS cached_input_tokens,
        COALESCE(output_tokens, 0) AS output_tokens,
        COALESCE(reasoning_tokens, 0) AS reasoning_tokens
      FROM model_call
      ${whereSql}
      ORDER BY date ASC`
    )
    .all(...params) as Record<string, unknown>[]

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
  pricingData?: Record<string, unknown> | null
}

export function getOverview(options: DateRange | GetOverviewOptions): OverviewResponse {
  const range = typeof options === 'object' && 'range' in options ? options.range : options
  const pricingData =
    typeof options === 'object' && 'pricingData' in options ? (options.pricingData ?? null) : null

  const db = getDatabase()
  const currentTokens = queryTokenTotals(db, range)
  const currentSessions = querySessionsCount(db, range)
  const currentTools = queryToolSummary(db, range)
  const dailySeries = queryDailySeries(db, range, pricingData)

  const totalCost = dailySeries.reduce((sum, p) => sum + p.estimatedCost, 0)

  const prevRange = getPreviousRange(range)
  const prevTokens = prevRange ? queryTokenTotals(db, prevRange) : null
  const prevSessions = prevRange ? querySessionsCount(db, prevRange) : null
  const prevTools = prevRange ? queryToolSummary(db, prevRange) : null
  const prevDaily = prevRange ? queryDailySeries(db, prevRange, pricingData) : []
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
