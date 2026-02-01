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
      aggregates: { totalCalls: 0, totalTokens: 0, totalCost: 0, avgDurationMs: 0 } 
    }
  }

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', options.range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(DISTINCT model) AS total FROM model_call ${whereSql}`)
    .get(...params) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const rows = db
    .prepare(
      `SELECT
        model,
        COUNT(*) AS call_count,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
      FROM model_call
      ${whereSql}
      GROUP BY model
      ORDER BY total_tokens DESC, call_count DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, options.pagination.limit, options.pagination.offset) as Record<
    string,
    unknown
  >[]

  const pricingData = (options.pricingData ?? null) as Record<string, unknown> | null

  const models = rows.map((row) => {
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

  // Calculate Aggregates
  let totalCalls = 0
  let totalTokens = 0
  let totalCost = 0
  let totalDuration = 0
  let modelCount = 0

  for (const m of models) {
    totalCalls += m.callCount
    totalTokens += m.tokens.total
    totalCost += (m.estimatedCost ?? 0)
    totalDuration += m.avgDurationMs
    modelCount++
  }
  
  const aggregates: ModelsAggregates = {
      totalCalls,
      totalTokens,
      totalCost,
      avgDurationMs: modelCount > 0 ? totalDuration / modelCount : 0
  }

  return { total, models, aggregates }
}

export interface ModelsAggregates {
  totalCalls: number
  totalTokens: number
  totalCost: number
  avgDurationMs: number
}
