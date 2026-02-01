export type ApiError = {
  error: string
  code: string
}

export type RangeResponse = {
  start: string | null
  end: string | null
  startMs?: number
  endMs?: number
}

export type PaginationResponse = {
  limit: number
  offset: number
  total: number
  page: number
  pageSize: number
}

export type OverviewKpiValue = {
  value: number
  previous: number | null
  delta: number | null
  deltaPct: number | null
}

export type OverviewSeriesPoint = {
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

export type OverviewResponse = {
  range?: RangeResponse
  kpis: {
    totalTokens: OverviewKpiValue
    cacheHitRate: OverviewKpiValue
    sessions: OverviewKpiValue
    modelCalls: OverviewKpiValue
    toolCalls: OverviewKpiValue
    successRate: OverviewKpiValue
    totalCost: OverviewKpiValue
    avgModelDurationMs: OverviewKpiValue
    avgToolDurationMs: OverviewKpiValue
  }
  series: {
    daily: OverviewSeriesPoint[]
  }
}

export type TokenTotals = {
  input: number
  cachedInput: number
  output: number
  reasoning: number
  total: number
  cacheHitRate: number
}

export type SessionListItem = {
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
  tokens: TokenTotals
  avgModelDurationMs: number
  avgToolDurationMs: number
  successRate: number
  durationMs: number | null
}

export type SessionsResponse = {
  range?: RangeResponse
  filters: {
    search: string | null
    models: string[]
    providers: string[]
    project: string | null
    branch: string | null
    worktree: string | null
    originator: string | null
    cliVersion: string | null
  }
  pagination: PaginationResponse
  sessions: SessionListItem[]
}

export type SessionMediansPoint = {
  date: string
  medianCalls: number
  medianTokens: number
  medianCost: number
  medianDurationMs: number
}

export type SessionMediansSummary = {
  medianCalls: number
  medianTokens: number
  medianCost: number
  medianDurationMs: number
}

export type SessionsMediansResponse = {
  range?: RangeResponse
  series: SessionMediansPoint[]
  summary: SessionMediansSummary
}

export type ProjectListItem = {
  id: string
  name: string
  rootPath: string | null
  gitRemote: string | null
  firstSeenTs: number | null
  lastSeenTs: number | null
  sessionCount: number
  modelCallCount: number
  toolCallCount: number
  totalTokens: number
  cacheHitRate: number
  estimatedCost: number
  toolSuccessRate: number
}

export type ProjectsAggregates = {
  totalProjects: number
  totalSessions: number
  totalTokens: number
  totalCost: number
  avgSuccessRate: number
}

export type ProjectsResponse = {
  range?: RangeResponse
  filters: { search: string | null }
  pagination: PaginationResponse
  projects: ProjectListItem[]
  aggregates?: ProjectsAggregates
}

export type SessionDetailResponse = {
  range?: RangeResponse
  session: {
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
  } | null
  stats: {
    messageCount: number
    modelCallCount: number
    toolCallCount: number
    tokens: TokenTotals
    avgModelDurationMs: number
    avgToolDurationMs: number
    successRate: number
    durationMs: number | null
  } | null
  messages: {
    pagination: PaginationResponse
    items: Array<{
      id: string
      ts: number
      role: string
      content: string | null
    }>
  }
  modelCalls: {
    pagination: PaginationResponse
    items: Array<{
      id: string
      ts: number
      model: string | null
      inputTokens: number
      cachedInputTokens: number
      outputTokens: number
      reasoningTokens: number
      totalTokens: number
      durationMs: number | null
    }>
  }
  toolCalls: {
    pagination: PaginationResponse
    items: Array<{
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
    }>
  }
}

export type ModelSummary = {
  model: string
  callCount: number
  tokens: TokenTotals
  avgDurationMs: number
  estimatedCost: number | null
}

export type ModelsAggregates = {
  totalCalls: number
  totalTokens: number
  totalCost: number
  avgDurationMs: number
}

export type ModelsResponse = {
  range?: RangeResponse
  pagination: PaginationResponse
  models: ModelSummary[]
  aggregates?: ModelsAggregates
}

export type ProviderSummary = {
  provider: string
  sessionCount: number
  modelCallCount: number
  tokens: TokenTotals
  avgModelDurationMs: number
}

export type ProvidersResponse = {
  range?: RangeResponse
  pagination: PaginationResponse
  providers: ProviderSummary[]
}

export type ToolCallSummary = {
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

export type ToolCallListItem = {
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

export type ToolBreakdown = {
  tool: string
  count: number
  successRate: number
  avgDurationMs: number
}

export type FailureBreakdown = {
  error: string
  count: number
  tool: string | null
}

export type ToolCallsResponse = {
  range?: RangeResponse
  filters: {
    status: string[]
    tools: string[]
    sessionId: string | null
    search: string | null
  }
  pagination: PaginationResponse
  summary: ToolCallSummary
  breakdown?: {
    tools: ToolBreakdown[]
    failures: FailureBreakdown[]
  }
  toolCalls: ToolCallListItem[]
}

export type ActivityPoint = {
  date: string
  messageCount: number
  callCount: number
  tokenTotal: number
}

export type ActivitySummary = {
  totalMessages: number
  totalCalls: number
  totalTokens: number
  totalSessions: number
  activeDays: number
  prevTotalMessages?: number
  prevTotalCalls?: number
  prevTotalTokens?: number
  prevTotalSessions?: number
  prevActiveDays?: number
}

export type ActivityResponse = {
  range?: RangeResponse
  activity: ActivityPoint[]
  summary: ActivitySummary
}

export type IngestResult = {
  filesProcessed: number
  linesIngested: number
  errors: Array<{ file: string; line: number; error: string }>
  durationMs: number
}

export type IngestStatusResponse = {
  status: 'idle' | 'running'
  lastRun: string | null
  lastResult: IngestResult | null
}
