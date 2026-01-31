import { applyDateRange, DateRange, getPreviousRange } from './date-range';
import { getDatabase, tableExists } from './db';

type KpiValue = {
  value: number;
  previous: number | null;
  delta: number | null;
  deltaPct: number | null;
};

export interface OverviewSeriesPoint {
  date: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  modelCalls: number;
  cacheHitRate: number;
}

export interface OverviewResponse {
  kpis: {
    totalTokens: KpiValue;
    cacheHitRate: KpiValue;
    sessions: KpiValue;
    modelCalls: KpiValue;
    toolCalls: KpiValue;
    successRate: KpiValue;
    avgModelDurationMs: KpiValue;
    avgToolDurationMs: KpiValue;
  };
  series: {
    daily: OverviewSeriesPoint[];
  };
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function kpi(value: number, previous: number | null): KpiValue {
  if (previous === null) {
    return { value, previous, delta: null, deltaPct: null };
  }
  const delta = value - previous;
  const deltaPct = previous === 0 ? null : delta / previous;
  return { value, previous, delta, deltaPct };
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
    };
  }
  const where: string[] = [];
  const params: unknown[] = [];
  applyDateRange('ts', range, where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

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
    .get(params) as Record<string, unknown> | undefined;

  return {
    inputTokens: toNumber(row?.input_tokens),
    cachedInputTokens: toNumber(row?.cached_input_tokens),
    outputTokens: toNumber(row?.output_tokens),
    reasoningTokens: toNumber(row?.reasoning_tokens),
    totalTokens: toNumber(row?.total_tokens),
    modelCalls: toNumber(row?.model_calls),
    avgDurationMs: toNumber(row?.avg_duration_ms),
  };
}

function querySessionsCount(db: ReturnType<typeof getDatabase>, range: DateRange): number {
  if (!tableExists(db, 'session')) {
    return 0;
  }
  const where: string[] = [];
  const params: unknown[] = [];
  applyDateRange('ts', range, where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = db
    .prepare(`SELECT COUNT(*) AS sessions FROM session ${whereSql}`)
    .get(params) as Record<string, unknown> | undefined;
  return toNumber(row?.sessions);
}

function queryToolSummary(db: ReturnType<typeof getDatabase>, range: DateRange) {
  if (!tableExists(db, 'tool_call')) {
    return { toolCalls: 0, okCalls: 0, avgDurationMs: 0 };
  }
  const where: string[] = [];
  const params: unknown[] = [];
  applyDateRange('start_ts', range, where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS tool_calls,
        SUM(CASE WHEN status = 'ok' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_calls,
        COALESCE(AVG(duration_ms), 0) AS avg_duration_ms
      FROM tool_call
      ${whereSql}`
    )
    .get(params) as Record<string, unknown> | undefined;

  return {
    toolCalls: toNumber(row?.tool_calls),
    okCalls: toNumber(row?.ok_calls),
    avgDurationMs: toNumber(row?.avg_duration_ms),
  };
}

function queryDailySeries(db: ReturnType<typeof getDatabase>, range: DateRange): OverviewSeriesPoint[] {
  if (!tableExists(db, 'model_call')) {
    return [];
  }
  const where: string[] = [];
  const params: unknown[] = [];
  applyDateRange('ts', range, where, params);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS output_tokens,
        COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*) AS model_calls
      FROM model_call
      ${whereSql}
      GROUP BY date
      ORDER BY date ASC`
    )
    .all(params) as Record<string, unknown>[];

  return rows.map((row) => {
    const inputTokens = toNumber(row.input_tokens);
    const cachedInputTokens = toNumber(row.cached_input_tokens);
    const cacheHitRate = inputTokens > 0 ? cachedInputTokens / inputTokens : 0;
    return {
      date: String(row.date ?? ''),
      inputTokens,
      cachedInputTokens,
      outputTokens: toNumber(row.output_tokens),
      reasoningTokens: toNumber(row.reasoning_tokens),
      totalTokens: toNumber(row.total_tokens),
      modelCalls: toNumber(row.model_calls),
      cacheHitRate,
    };
  });
}

export function getOverview(range: DateRange): OverviewResponse {
  const db = getDatabase();
  const currentTokens = queryTokenTotals(db, range);
  const currentSessions = querySessionsCount(db, range);
  const currentTools = queryToolSummary(db, range);

  const prevRange = getPreviousRange(range);
  const prevTokens = prevRange ? queryTokenTotals(db, prevRange) : null;
  const prevSessions = prevRange ? querySessionsCount(db, prevRange) : null;
  const prevTools = prevRange ? queryToolSummary(db, prevRange) : null;

  const cacheHitRate =
    currentTokens.inputTokens > 0
      ? currentTokens.cachedInputTokens / currentTokens.inputTokens
      : 0;
  const prevCacheHitRate =
    prevTokens && prevTokens.inputTokens > 0
      ? prevTokens.cachedInputTokens / prevTokens.inputTokens
      : null;

  const successRate =
    currentTools.toolCalls > 0 ? currentTools.okCalls / currentTools.toolCalls : 0;
  const prevSuccessRate =
    prevTools && prevTools.toolCalls > 0
      ? prevTools.okCalls / prevTools.toolCalls
      : null;

  return {
    kpis: {
      totalTokens: kpi(currentTokens.totalTokens, prevTokens?.totalTokens ?? null),
      cacheHitRate: kpi(cacheHitRate, prevCacheHitRate),
      sessions: kpi(currentSessions, prevSessions),
      modelCalls: kpi(currentTokens.modelCalls, prevTokens?.modelCalls ?? null),
      toolCalls: kpi(currentTools.toolCalls, prevTools?.toolCalls ?? null),
      successRate: kpi(successRate, prevSuccessRate),
      avgModelDurationMs: kpi(
        currentTokens.avgDurationMs,
        prevTokens?.avgDurationMs ?? null
      ),
      avgToolDurationMs: kpi(
        currentTools.avgDurationMs,
        prevTools?.avgDurationMs ?? null
      ),
    },
    series: {
      daily: queryDailySeries(db, range),
    },
  };
}
