export type ApiError = {
  error: string;
  code: string;
};

export type RangeResponse = {
  start: string | null;
  end: string | null;
  startMs?: number;
  endMs?: number;
};

export type PaginationResponse = {
  limit: number;
  offset: number;
  total: number;
  page: number;
  pageSize: number;
};

export type OverviewKpiValue = {
  value: number;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export type OverviewSeriesPoint = {
  date: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  modelCalls: number;
  cacheHitRate: number;
};

export type OverviewResponse = {
  range?: RangeResponse;
  kpis: {
    totalTokens: OverviewKpiValue;
    cacheHitRate: OverviewKpiValue;
    sessions: OverviewKpiValue;
    modelCalls: OverviewKpiValue;
    toolCalls: OverviewKpiValue;
    successRate: OverviewKpiValue;
    avgModelDurationMs: OverviewKpiValue;
    avgToolDurationMs: OverviewKpiValue;
  };
  series: {
    daily: OverviewSeriesPoint[];
  };
};

export type TokenTotals = {
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
  total: number;
  cacheHitRate: number;
};

export type SessionListItem = {
  id: string;
  ts: number;
  cwd: string | null;
  originator: string | null;
  cliVersion: string | null;
  modelProvider: string | null;
  gitBranch: string | null;
  gitCommit: string | null;
  messageCount: number;
  modelCallCount: number;
  toolCallCount: number;
  tokens: TokenTotals;
  avgModelDurationMs: number;
  avgToolDurationMs: number;
  successRate: number;
  durationMs: number | null;
};

export type SessionsResponse = {
  range?: RangeResponse;
  filters: {
    search: string | null;
    models: string[];
    providers: string[];
  };
  pagination: PaginationResponse;
  sessions: SessionListItem[];
};

export type SessionDetailResponse = {
  range?: RangeResponse;
  session: {
    id: string;
    ts: number;
    cwd: string | null;
    originator: string | null;
    cliVersion: string | null;
    modelProvider: string | null;
    gitBranch: string | null;
    gitCommit: string | null;
    sourceFile: string | null;
    sourceLine: number | null;
  } | null;
  stats: {
    messageCount: number;
    modelCallCount: number;
    toolCallCount: number;
    tokens: TokenTotals;
    avgModelDurationMs: number;
    avgToolDurationMs: number;
    successRate: number;
    durationMs: number | null;
  } | null;
  messages: {
    pagination: PaginationResponse;
    items: Array<{
      id: string;
      ts: number;
      role: string;
      content: string | null;
    }>;
  };
  modelCalls: {
    pagination: PaginationResponse;
    items: Array<{
      id: string;
      ts: number;
      model: string | null;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      durationMs: number | null;
    }>;
  };
  toolCalls: {
    pagination: PaginationResponse;
    items: Array<{
      id: string;
      toolName: string;
      command: string | null;
      status: string;
      startTs: number;
      endTs: number | null;
      durationMs: number | null;
      exitCode: number | null;
      error: string | null;
      stdoutBytes: number | null;
      stderrBytes: number | null;
      correlationKey: string | null;
    }>;
  };
};

export type ModelSummary = {
  model: string;
  callCount: number;
  tokens: TokenTotals;
  avgDurationMs: number;
};

export type ModelsResponse = {
  range?: RangeResponse;
  pagination: PaginationResponse;
  models: ModelSummary[];
};

export type ProviderSummary = {
  provider: string;
  sessionCount: number;
  modelCallCount: number;
  tokens: TokenTotals;
  avgModelDurationMs: number;
};

export type ProvidersResponse = {
  range?: RangeResponse;
  pagination: PaginationResponse;
  providers: ProviderSummary[];
};

export type ToolCallSummary = {
  total: number;
  ok: number;
  failed: number;
  unknown: number;
  avgDurationMs: number;
  successRate: number;
};

export type ToolCallListItem = {
  id: string;
  sessionId: string | null;
  toolName: string;
  command: string | null;
  status: string;
  startTs: number;
  endTs: number | null;
  durationMs: number | null;
  exitCode: number | null;
  error: string | null;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  correlationKey: string | null;
};

export type ToolCallsResponse = {
  range?: RangeResponse;
  filters: {
    status: string[];
    tools: string[];
    sessionId: string | null;
    search: string | null;
  };
  pagination: PaginationResponse;
  summary: ToolCallSummary;
  toolCalls: ToolCallListItem[];
};

export type ActivityPoint = {
  date: string;
  messageCount: number;
  callCount: number;
  tokenTotal: number;
};

export type ActivitySummary = {
  totalMessages: number;
  totalCalls: number;
  totalTokens: number;
  activeDays: number;
};

export type ActivityResponse = {
  range?: RangeResponse;
  activity: ActivityPoint[];
  summary: ActivitySummary;
};

export type IngestResult = {
  filesProcessed: number;
  linesIngested: number;
  errors: Array<{ file: string; line: number; error: string }>;
  durationMs: number;
};

export type IngestStatusResponse = {
  status: "idle" | "running";
  lastRun: string | null;
  lastResult: IngestResult | null;
};
