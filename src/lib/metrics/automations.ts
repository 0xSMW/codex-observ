import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange, getPreviousRange } from './date-range'
import { getDatabase, tableExists } from './db'
import type { Pagination } from './pagination'

type KpiValue = {
  value: number
  previous: number | null
  delta: number | null
  deltaPct: number | null
}

export interface AutomationSeriesPoint {
  date: string
  queued: number
  completed: number
  failed: number
  backlog: number
}

export interface AutomationsResponse {
  kpis: {
    queued: KpiValue
    completed: KpiValue
    failed: KpiValue
    backlogPeak: KpiValue
    failureRate: KpiValue
  }
  series: {
    daily: AutomationSeriesPoint[]
  }
}

export interface AutomationEventsOptions {
  range: DateRange
  pagination: Pagination
  search?: string | null
}

export interface AutomationEventListItem {
  id: string
  ts: number
  action: string
  threadId: string | null
  status: string | null
  error: string | null
}

export interface AutomationEventsResult {
  total: number
  events: AutomationEventListItem[]
}

function kpi(value: number, previous: number | null): KpiValue {
  if (previous === null) {
    return { value, previous, delta: null, deltaPct: null }
  }
  const delta = value - previous
  const deltaPct = previous === 0 ? null : delta / previous
  return { value, previous, delta, deltaPct }
}

function querySummary(db: ReturnType<typeof getDatabase>, range: DateRange) {
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN action = 'queued' THEN 1 ELSE 0 END), 0) AS queued_count,
        COALESCE(SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN action = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count
      FROM automation_event
      ${whereSql}`
    )
    .get(...params) as Record<string, unknown> | undefined

  return {
    queued: toNumber(row?.queued_count),
    completed: toNumber(row?.completed_count),
    failed: toNumber(row?.failed_count),
  }
}

function queryBaseline(db: ReturnType<typeof getDatabase>, startMs: number): number {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE
          WHEN action = 'queued' THEN 1
          WHEN action = 'completed' THEN -1
          ELSE 0
        END), 0) AS net
      FROM automation_event
      WHERE ts < ?`
    )
    .get(startMs) as Record<string, unknown> | undefined
  return toNumber(row?.net)
}

function queryDailySeries(
  db: ReturnType<typeof getDatabase>,
  range: DateRange
): { series: AutomationSeriesPoint[]; backlogPeak: number } {
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
        COALESCE(SUM(CASE WHEN action = 'queued' THEN 1 ELSE 0 END), 0) AS queued_count,
        COALESCE(SUM(CASE WHEN action = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
        COALESCE(SUM(CASE WHEN action = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count
      FROM automation_event
      ${whereSql}
      GROUP BY date
      ORDER BY date ASC`
    )
    .all(...params) as Record<string, unknown>[]

  let backlog = range.startMs !== undefined ? queryBaseline(db, range.startMs) : 0
  let backlogPeak = backlog
  const series: AutomationSeriesPoint[] = []

  for (const row of rows) {
    const queued = toNumber(row.queued_count)
    const completed = toNumber(row.completed_count)
    const failed = toNumber(row.failed_count)
    backlog = Math.max(0, backlog + queued - completed)
    backlogPeak = Math.max(backlogPeak, backlog)
    series.push({
      date: String(row.date ?? ''),
      queued,
      completed,
      failed,
      backlog,
    })
  }

  return { series, backlogPeak }
}

function getBacklogPeakAtEnd(db: ReturnType<typeof getDatabase>, range: DateRange): number {
  const { backlogPeak } = queryDailySeries(db, range)
  return backlogPeak
}

export function getAutomations(range: DateRange): AutomationsResponse {
  const db = getDatabase()
  if (!tableExists(db, 'automation_event')) {
    return {
      kpis: {
        queued: kpi(0, null),
        completed: kpi(0, null),
        failed: kpi(0, null),
        backlogPeak: kpi(0, null),
        failureRate: kpi(0, null),
      },
      series: { daily: [] },
    }
  }

  const summary = querySummary(db, range)
  const prevRange = getPreviousRange(range)
  const prevSummary = prevRange ? querySummary(db, prevRange) : null

  const { series, backlogPeak } = queryDailySeries(db, range)
  const prevBacklogPeak = prevRange ? getBacklogPeakAtEnd(db, prevRange) : null

  const failureRate =
    summary.completed + summary.failed > 0
      ? summary.failed / (summary.completed + summary.failed)
      : 0
  const prevFailureRate =
    prevSummary && prevSummary.completed + prevSummary.failed > 0
      ? prevSummary.failed / (prevSummary.completed + prevSummary.failed)
      : null

  return {
    kpis: {
      queued: kpi(summary.queued, prevSummary?.queued ?? null),
      completed: kpi(summary.completed, prevSummary?.completed ?? null),
      failed: kpi(summary.failed, prevSummary?.failed ?? null),
      backlogPeak: kpi(backlogPeak, prevBacklogPeak),
      failureRate: kpi(failureRate, prevFailureRate),
    },
    series: {
      daily: series,
    },
  }
}

export function getAutomationEvents(options: AutomationEventsOptions): AutomationEventsResult {
  const db = getDatabase()
  if (!tableExists(db, 'automation_event')) {
    return { total: 0, events: [] }
  }

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', options.range, where, params)

  if (options.search) {
    where.push('(thread_id LIKE ? OR error LIKE ? OR action LIKE ?)')
    const term = `%${options.search}%`
    params.push(term, term, term)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM automation_event ${whereSql}`)
    .get(...params) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const rows = db
    .prepare(
      `SELECT id, ts, action, thread_id, status, error
       FROM automation_event
       ${whereSql}
       ORDER BY ts DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, options.pagination.limit, options.pagination.offset) as Record<
    string,
    unknown
  >[]

  const events = rows.map((row) => ({
    id: String(row.id ?? ''),
    ts: toNumber(row.ts),
    action: String(row.action ?? ''),
    threadId: (row.thread_id as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  }))

  return { total, events }
}
