export type DateRange = {
  startDate?: string
  endDate?: string
}

export type TokenTotals = {
  input: number
  cached: number
  output: number
  reasoning: number
  total: number
}

export type CacheUtilizationPoint = {
  date: string // YYYY-MM-DD
  rate: number
}

export type TokenSeriesPoint = {
  date: string // YYYY-MM-DD
  input: number
  cached: number
  output: number
}

export type CountSeriesPoint = {
  date: string // YYYY-MM-DD
  count: number
}

export type ToolCallStatus = 'ok' | 'failed' | 'unknown'

export type ToolCallSummary = {
  total: number
  successful: number
  failed: number
  unknown: number
  successRate: number
  avgDuration: number | null
}

export type SessionSummary = {
  id: string
  ts: number
  cwd: string | null
  model: string | null
  provider: string | null
  messageCount: number
  totalTokens: number
  durationMs: number | null
}

export type ModelUsage = {
  model: string
  provider: string
  callCount: number
  totalTokens: number
  avgTokensPerCall: number
  cacheUtilization: number
  estimatedCost: number | null
}

export type ProviderUsage = {
  provider: string
  callCount: number
  totalTokens: number
  modelCount: number
}

export type DailyActivity = {
  date: string
  messageCount: number
  modelCalls: number
  tokens: number
}
