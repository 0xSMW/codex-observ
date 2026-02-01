import { computeCost, getPricingForModel } from '@/lib/pricing'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'

export interface ModelsListOptions {
  range: DateRange
  pagination: Pagination
  pricingData?: Record<string, unknown> | null
}

export interface ModelSummary {
  model: string
  callCount: number
  tokens: {
    input: number
    cachedInput: number
    output: number
    reasoning: number
    total: number
    cacheHitRate: number
  }
  avgDurationMs: number
  estimatedCost: number | null
}

export interface ModelsListResult {
  total: number
  models: ModelSummary[]
  aggregates: ModelsAggregates
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

export function getModelsList(options: ModelsListOptions): ModelsListResult {
  const db = getDatabase()
  if (!tableExists(db, 'model_call')) {
    return {
      total: 0,
      models: [],
      aggregates: { totalCalls: 0, totalTokens: 0, totalCost: 0, avgDurationMs: 0 },
    }
  }

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', options.range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // Derive duration from next call's ts when duration_ms is null (same as session-detail)
  const rows = db
    .prepare(
      `WITH with_next_ts AS (
        SELECT
          model, ts, duration_ms,
          input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
          LEAD(ts) OVER (PARTITION BY session_id ORDER BY ts) AS next_ts
        FROM model_call
        ${whereSql}
      ),
      with_effective_duration AS (
        SELECT
          model, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
          COALESCE(duration_ms, CASE WHEN next_ts IS NOT NULL AND next_ts > ts THEN next_ts - ts ELSE NULL END) AS effective_duration_ms
        FROM with_next_ts
      )
      SELECT
        model,
        COUNT(*) AS call_count,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(AVG(effective_duration_ms), 0) AS avg_duration_ms
      FROM with_effective_duration
      GROUP BY model
      ORDER BY total_tokens DESC, call_count DESC`
    )
    .all(...params) as Record<string, unknown>[]

  const total = rows.length

  // Apply pagination in memory
  const { limit, offset } = options.pagination
  const paginatedRows = rows.slice(offset, offset + limit)

  const pricingData = (options.pricingData ?? null) as Record<string, unknown> | null

  const models = paginatedRows.map((row) => {
    const inputTokens = toNumber(row.input_tokens)
    const cachedInputTokens = toNumber(row.cached_input_tokens)
    const model = String(row.model ?? 'unknown')
    const outputTokens = toNumber(row.output_tokens)
    const reasoningTokens = toNumber(row.reasoning_tokens)
    const pricing = getPricingForModel(
      pricingData as Parameters<typeof getPricingForModel>[0],
      model
    )
    const cost = computeCost(pricing, inputTokens, cachedInputTokens, outputTokens, reasoningTokens)
    return {
      model,
      callCount: toNumber(row.call_count),
      tokens: {
        input: inputTokens,
        cachedInput: cachedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        total: toNumber(row.total_tokens),
        cacheHitRate: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
      },
      avgDurationMs: toNumber(row.avg_duration_ms),
      estimatedCost: cost,
    } satisfies ModelSummary
  })

  // Build full list for aggregate computation (same shape as models but from all rows)
  const allSummaries = rows.map((row) => {
    const inputTokens = toNumber(row.input_tokens)
    const cachedInputTokens = toNumber(row.cached_input_tokens)
    const model = String(row.model ?? 'unknown')
    const outputTokens = toNumber(row.output_tokens)
    const reasoningTokens = toNumber(row.reasoning_tokens)
    const pricing = getPricingForModel(
      pricingData as Parameters<typeof getPricingForModel>[0],
      model
    )
    const cost = computeCost(pricing, inputTokens, cachedInputTokens, outputTokens, reasoningTokens)
    return {
      callCount: toNumber(row.call_count),
      totalTokens: toNumber(row.total_tokens),
      estimatedCost: cost,
      avgDurationMs: toNumber(row.avg_duration_ms),
    }
  })

  let totalCalls = 0
  let totalTokens = 0
  let totalCost = 0
  let durationWeightedSum = 0

  for (const s of allSummaries) {
    totalCalls += s.callCount
    totalTokens += s.totalTokens
    totalCost += s.estimatedCost ?? 0
    durationWeightedSum += s.avgDurationMs * s.callCount
  }

  const aggregates: ModelsAggregates = {
    totalCalls,
    totalTokens,
    totalCost,
    avgDurationMs: totalCalls > 0 ? durationWeightedSum / totalCalls : 0,
  }

  return { total, models, aggregates }
}

export interface ModelsAggregates {
  totalCalls: number
  totalTokens: number
  totalCost: number
  avgDurationMs: number
}
