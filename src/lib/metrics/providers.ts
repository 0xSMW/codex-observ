import { applyDateRange, DateRange } from './date-range';
import { getDatabase, tableExists } from './db';
import { Pagination } from './pagination';

export interface ProvidersListOptions {
  range: DateRange;
  pagination: Pagination;
}

export interface ProviderSummary {
  provider: string;
  sessionCount: number;
  modelCallCount: number;
  tokens: {
    input: number;
    cachedInput: number;
    output: number;
    reasoning: number;
    total: number;
    cacheHitRate: number;
  };
  avgModelDurationMs: number;
}

export interface ProvidersListResult {
  total: number;
  providers: ProviderSummary[];
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

export function getProvidersList(options: ProvidersListOptions): ProvidersListResult {
  const db = getDatabase();
  if (!tableExists(db, 'session')) {
    return { total: 0, providers: [] };
  }

  const hasModelCall = tableExists(db, 'model_call');

  const where: string[] = [];
  const params: unknown[] = [];
  if (hasModelCall) {
    applyDateRange('mc.ts', options.range, where, params);
  } else {
    applyDateRange('s.ts', options.range, where, params);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const joinSql = hasModelCall ? 'LEFT JOIN model_call mc ON mc.session_id = s.id' : '';
  const totalRow = db
    .prepare(
      `SELECT COUNT(DISTINCT COALESCE(s.model_provider, 'unknown')) AS total
      FROM session s
      ${joinSql}
      ${whereSql}`
    )
    .get(params) as Record<string, unknown> | undefined;
  const total = toNumber(totalRow?.total);

  const modelColumns = hasModelCall
    ? `\n        COUNT(mc.id) AS model_call_count,\n        COALESCE(SUM(mc.input_tokens), 0) AS input_tokens,\n        COALESCE(SUM(mc.cached_input_tokens), 0) AS cached_input_tokens,\n        COALESCE(SUM(mc.output_tokens), 0) AS output_tokens,\n        COALESCE(SUM(mc.reasoning_tokens), 0) AS reasoning_tokens,\n        COALESCE(SUM(mc.total_tokens), 0) AS total_tokens,\n        COALESCE(AVG(mc.duration_ms), 0) AS avg_duration_ms`
    : `\n        0 AS model_call_count,\n        0 AS input_tokens,\n        0 AS cached_input_tokens,\n        0 AS output_tokens,\n        0 AS reasoning_tokens,\n        0 AS total_tokens,\n        0 AS avg_duration_ms`;

  const rows = db
    .prepare(
      `SELECT
        COALESCE(s.model_provider, 'unknown') AS provider,
        COUNT(DISTINCT s.id) AS session_count,${modelColumns}
      FROM session s
      ${joinSql}
      ${whereSql}
      GROUP BY provider
      ORDER BY total_tokens DESC
      LIMIT ? OFFSET ?`
    )
    .all([...params, options.pagination.limit, options.pagination.offset]) as Record<
    string,
    unknown
  >[];

  const providers = rows.map((row) => {
    const inputTokens = toNumber(row.input_tokens);
    const cachedInputTokens = toNumber(row.cached_input_tokens);
    return {
      provider: String(row.provider ?? 'unknown'),
      sessionCount: toNumber(row.session_count),
      modelCallCount: toNumber(row.model_call_count),
      tokens: {
        input: inputTokens,
        cachedInput: cachedInputTokens,
        output: toNumber(row.output_tokens),
        reasoning: toNumber(row.reasoning_tokens),
        total: toNumber(row.total_tokens),
        cacheHitRate: inputTokens > 0 ? cachedInputTokens / inputTokens : 0,
      },
      avgModelDurationMs: toNumber(row.avg_duration_ms),
    } satisfies ProviderSummary;
  });

  return { total, providers };
}
