import { computeCost, getPricingForModel } from '@/lib/pricing'
import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'

export interface SessionMediansPoint {
  date: string
  medianCalls: number
  medianTokens: number
  medianCost: number
  medianDurationMs: number
}

export interface SessionMediansSummary {
  medianCalls: number
  medianTokens: number
  medianCost: number
  medianDurationMs: number
}

export interface GetSessionMediansOptions {
  range: DateRange
  pricingData?: Record<string, unknown> | null
}

export interface SessionMediansResult {
  series: SessionMediansPoint[]
  summary: SessionMediansSummary
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function getSessionMedians(options: GetSessionMediansOptions): SessionMediansResult {
  const { range, pricingData } = options
  const db = getDatabase()
  if (!tableExists(db, 'session')) {
    return {
      series: [],
      summary: { medianCalls: 0, medianTokens: 0, medianCost: 0, medianDurationMs: 0 },
    }
  }

  const hasModelCall = tableExists(db, 'model_call')
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('s.ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const modelCallCountSql = hasModelCall
    ? '(SELECT COUNT(*) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const totalTokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(total_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'
  const firstModelSql = hasModelCall
    ? '(SELECT MIN(ts) FROM model_call mc WHERE mc.session_id = s.id)'
    : 'NULL'
  const lastModelSql = hasModelCall
    ? '(SELECT MAX(ts) FROM model_call mc WHERE mc.session_id = s.id)'
    : 'NULL'

  const sessionRows = db
    .prepare(
      `SELECT
        s.id,
        s.ts,
        ${modelCallCountSql} AS model_call_count,
        ${totalTokensSql} AS total_tokens,
        ${firstModelSql} AS first_model_ts,
        ${lastModelSql} AS last_model_ts
      FROM session s
      ${whereSql}
      ORDER BY s.ts ASC`
    )
    .all(...params) as Record<string, unknown>[]

  const sessionsByDate = new Map<
    string,
    { id: string; calls: number; tokens: number; durationMs: number | null }[]
  >()

  for (const row of sessionRows) {
    const id = String(row.id ?? '')
    const ts = toNumber(row.ts)
    const date = new Date(ts).toISOString().slice(0, 10)
    const calls = toNumber(row.model_call_count)
    const tokens = toNumber(row.total_tokens)
    const first = toNumber(row.first_model_ts, Number.NaN)
    const last = toNumber(row.last_model_ts, Number.NaN)
    let durationMs: number | null = null
    if (Number.isFinite(first) && Number.isFinite(last) && last >= first) {
      durationMs = last - first
    }

    let list = sessionsByDate.get(date)
    if (!list) {
      list = []
      sessionsByDate.set(date, list)
    }
    list.push({ id, calls, tokens, durationMs })
  }

  let sessionCostMap = new Map<string, number>()
  if (hasModelCall && pricingData) {
    const mcWhere: string[] = []
    const mcParams: unknown[] = []
    applyDateRange('ts', range, mcWhere, mcParams)
    const mcWhereSql = mcWhere.length ? `WHERE ${mcWhere.join(' AND ')}` : ''
    const mcRows = db
      .prepare(
        `SELECT session_id, model,
         COALESCE(input_tokens, 0) AS input_tokens,
         COALESCE(cached_input_tokens, 0) AS cached_input_tokens,
         COALESCE(output_tokens, 0) AS output_tokens,
         COALESCE(reasoning_tokens, 0) AS reasoning_tokens
         FROM model_call ${mcWhereSql}`
      )
      .all(...mcParams) as Record<string, unknown>[]

    const pricing = pricingData as Parameters<typeof getPricingForModel>[0]
    for (const row of mcRows) {
      const sessionId = String(row.session_id ?? '')
      const model = row.model != null ? String(row.model) : null
      const inputTokens = toNumber(row.input_tokens)
      const cachedInputTokens = toNumber(row.cached_input_tokens)
      const outputTokens = toNumber(row.output_tokens)
      const reasoningTokens = toNumber(row.reasoning_tokens)
      const p = getPricingForModel(pricing, model)
      const cost = computeCost(p, inputTokens, cachedInputTokens, outputTokens, reasoningTokens)
      if (cost !== null) {
        sessionCostMap.set(sessionId, (sessionCostMap.get(sessionId) ?? 0) + cost)
      }
    }
  }

  const dates = Array.from(sessionsByDate.keys()).sort()
  const series: SessionMediansPoint[] = []
  const allCalls: number[] = []
  const allTokens: number[] = []
  const allCosts: number[] = []
  const allDurations: number[] = []

  for (const date of dates) {
    const list = sessionsByDate.get(date) ?? []
    const calls = list.map((x) => x.calls)
    const tokens = list.map((x) => x.tokens)
    const durations = list.map((x) => x.durationMs).filter((d): d is number => d !== null)
    const costs = list.map((x) => sessionCostMap.get(x.id) ?? 0)

    series.push({
      date,
      medianCalls: median(calls),
      medianTokens: median(tokens),
      medianCost: median(costs),
      medianDurationMs: median(durations),
    })
    allCalls.push(...calls)
    allTokens.push(...tokens)
    allCosts.push(...costs)
    allDurations.push(...durations)
  }

  return {
    series,
    summary: {
      medianCalls: median(allCalls),
      medianTokens: median(allTokens),
      medianCost: median(allCosts),
      medianDurationMs: median(allDurations),
    },
  }
}
