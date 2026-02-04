import fs from 'fs'
import os from 'os'
import path from 'path'
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

export interface WorktreeSeriesPoint {
  date: string
  created: number
  deleted: number
  errors: number
  active: number
}

export interface WorktreesResponse {
  kpis: {
    created: KpiValue
    deleted: KpiValue
    errors: KpiValue
    active: KpiValue
    failureRate: KpiValue
  }
  series: {
    daily: WorktreeSeriesPoint[]
  }
}

export interface WorktreeEventsOptions {
  range: DateRange
  pagination: Pagination
  search?: string | null
}

export interface WorktreeEventListItem {
  id: string
  ts: number
  action: string
  worktreePath: string | null
  repoRoot: string | null
  branch: string | null
  status: string | null
  error: string | null
}

export interface WorktreeEventsResult {
  total: number
  events: WorktreeEventListItem[]
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
        COALESCE(SUM(CASE WHEN action = 'created' THEN 1 ELSE 0 END), 0) AS created_count,
        COALESCE(SUM(CASE WHEN action IN ('deleted', 'archived') THEN 1 ELSE 0 END), 0) AS deleted_count,
        COALESCE(SUM(CASE WHEN action = 'error' THEN 1 ELSE 0 END), 0) AS error_count
      FROM worktree_event
      ${whereSql}`
    )
    .get(...params) as Record<string, unknown> | undefined

  return {
    created: toNumber(row?.created_count),
    deleted: toNumber(row?.deleted_count),
    errors: toNumber(row?.error_count),
  }
}

function queryBaseline(db: ReturnType<typeof getDatabase>, startMs: number): number {
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE
          WHEN action = 'created' THEN 1
          WHEN action IN ('deleted', 'archived') THEN -1
          ELSE 0
        END), 0) AS net
      FROM worktree_event
      WHERE ts < ?`
    )
    .get(startMs) as Record<string, unknown> | undefined
  return toNumber(row?.net)
}

function queryDailySeries(
  db: ReturnType<typeof getDatabase>,
  range: DateRange
): WorktreeSeriesPoint[] {
  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', range, where, params)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
        COALESCE(SUM(CASE WHEN action = 'created' THEN 1 ELSE 0 END), 0) AS created_count,
        COALESCE(SUM(CASE WHEN action IN ('deleted', 'archived') THEN 1 ELSE 0 END), 0) AS deleted_count,
        COALESCE(SUM(CASE WHEN action = 'error' THEN 1 ELSE 0 END), 0) AS error_count
      FROM worktree_event
      ${whereSql}
      GROUP BY date
      ORDER BY date ASC`
    )
    .all(...params) as Record<string, unknown>[]

  let active = range.startMs !== undefined ? queryBaseline(db, range.startMs) : 0
  const series: WorktreeSeriesPoint[] = []

  for (const row of rows) {
    const created = toNumber(row.created_count)
    const deleted = toNumber(row.deleted_count)
    const errors = toNumber(row.error_count)
    active = Math.max(0, active + created - deleted)
    series.push({
      date: String(row.date ?? ''),
      created,
      deleted,
      errors,
      active,
    })
  }

  return series
}

function getActiveCountAtEnd(
  db: ReturnType<typeof getDatabase>,
  range: DateRange,
  summary: { created: number; deleted: number }
): number {
  const baseline = range.startMs !== undefined ? queryBaseline(db, range.startMs) : 0
  return Math.max(0, baseline + summary.created - summary.deleted)
}

function formatDate(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolveCodexHome(): string {
  return (
    process.env.CODEX_OBSERV_CODEX_HOME ||
    process.env.CODEX_HOME ||
    path.join(os.homedir(), '.codex')
  )
}

function countWorktreesOnDisk(): number | null {
  const worktreesDir = path.join(resolveCodexHome(), 'worktrees')
  try {
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).length
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : null
    if (code === 'ENOENT') {
      return 0
    }
    return null
  }
}

function shouldIncludeToday(range: DateRange): boolean {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  const startOk = range.startMs === undefined || range.startMs <= endOfToday.getTime()
  const endOk = range.endMs === undefined || range.endMs >= startOfToday.getTime()
  return startOk && endOk
}

export function getWorktrees(range: DateRange): WorktreesResponse {
  const db = getDatabase()
  if (!tableExists(db, 'worktree_event')) {
    return {
      kpis: {
        created: kpi(0, null),
        deleted: kpi(0, null),
        errors: kpi(0, null),
        active: kpi(0, null),
        failureRate: kpi(0, null),
      },
      series: { daily: [] },
    }
  }

  const summary = querySummary(db, range)
  const prevRange = getPreviousRange(range)
  const prevSummary = prevRange ? querySummary(db, prevRange) : null

  const filesystemActive = countWorktreesOnDisk()
  const active =
    filesystemActive !== null ? filesystemActive : getActiveCountAtEnd(db, range, summary)
  const prevActive =
    prevRange && prevSummary ? getActiveCountAtEnd(db, prevRange, prevSummary) : null

  const failureRate = summary.created > 0 ? summary.errors / summary.created : 0
  const prevFailureRate =
    prevSummary && prevSummary.created > 0 ? prevSummary.errors / prevSummary.created : null

  const series = queryDailySeries(db, range)
  if (filesystemActive !== null && shouldIncludeToday(range)) {
    const todayKey = formatDate(Date.now())
    const existing = series.find((point) => point.date === todayKey)
    if (existing) {
      existing.active = filesystemActive
    } else {
      series.push({
        date: todayKey,
        created: 0,
        deleted: 0,
        errors: 0,
        active: filesystemActive,
      })
      series.sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  return {
    kpis: {
      created: kpi(summary.created, prevSummary?.created ?? null),
      deleted: kpi(summary.deleted, prevSummary?.deleted ?? null),
      errors: kpi(summary.errors, prevSummary?.errors ?? null),
      active: kpi(active, prevActive),
      failureRate: kpi(failureRate, prevFailureRate),
    },
    series: {
      daily: series,
    },
  }
}

export function getWorktreeEvents(options: WorktreeEventsOptions): WorktreeEventsResult {
  const db = getDatabase()
  if (!tableExists(db, 'worktree_event')) {
    return { total: 0, events: [] }
  }

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('ts', options.range, where, params)

  if (options.search) {
    where.push(
      '(worktree_path LIKE ? OR repo_root LIKE ? OR branch LIKE ? OR error LIKE ? OR action LIKE ?)'
    )
    const term = `%${options.search}%`
    params.push(term, term, term, term, term)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM worktree_event ${whereSql}`)
    .get(...params) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const rows = db
    .prepare(
      `SELECT id, ts, action, worktree_path, repo_root, branch, status, error
       FROM worktree_event
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
    worktreePath: (row.worktree_path as string | null) ?? null,
    repoRoot: (row.repo_root as string | null) ?? null,
    branch: (row.branch as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  }))

  return { total, events }
}
