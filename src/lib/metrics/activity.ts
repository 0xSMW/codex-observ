import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'

export interface ActivityPoint {
  date: string // YYYY-MM-DD local
  messageCount: number
  callCount: number
  tokenTotal: number
}

export interface ActivitySummary {
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

export interface ActivityResult {
  activity: ActivityPoint[]
  summary: ActivitySummary
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return fallback
}

function formatDate(ms: number): string {
  const date = new Date(ms)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getActivity(range: DateRange): ActivityResult {
  const db = getDatabase()
  const hasDaily = tableExists(db, 'daily_activity')
  const hasMessage = tableExists(db, 'message')
  const hasModelCall = tableExists(db, 'model_call')

  const activityMap = new Map<string, ActivityPoint>()

  if (hasDaily) {
    const where: string[] = []
    const params: unknown[] = []

    if (range.startMs !== undefined) {
      where.push('date >= ?')
      params.push(formatDate(range.startMs))
    }
    if (range.endMs !== undefined) {
      where.push('date <= ?')
      params.push(formatDate(range.endMs))
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = db
      .prepare(
        `SELECT date, message_count, call_count, token_total
        FROM daily_activity
        ${whereSql}
        ORDER BY date ASC`
      )
      .all(...params) as Record<string, unknown>[]

    for (const row of rows) {
      const date = String(row.date ?? '')
      activityMap.set(date, {
        date,
        messageCount: toNumber(row.message_count),
        callCount: toNumber(row.call_count),
        tokenTotal: toNumber(row.token_total),
      })
    }
  }

  // Fallback to raw tables if daily_activity is empty (even if table exists)
  if (activityMap.size === 0) {
    if (hasMessage) {
      const where: string[] = []
      const params: unknown[] = []
      applyDateRange('ts', range, where, params)
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db
        .prepare(
          `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
            COUNT(*) AS message_count
          FROM message
          ${whereSql}
          GROUP BY date
          ORDER BY date ASC`
        )
        .all(...params) as Record<string, unknown>[]

      for (const row of rows) {
        const date = String(row.date ?? '')
        const existing = activityMap.get(date) ?? {
          date,
          messageCount: 0,
          callCount: 0,
          tokenTotal: 0,
        }
        existing.messageCount = toNumber(row.message_count)
        activityMap.set(date, existing)
      }
    }

    if (hasModelCall) {
      const where: string[] = []
      const params: unknown[] = []
      applyDateRange('ts', range, where, params)
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db
        .prepare(
          `SELECT strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS date,
            COUNT(*) AS call_count,
            COALESCE(SUM(total_tokens), 0) AS token_total
          FROM model_call
          ${whereSql}
          GROUP BY date
          ORDER BY date ASC`
        )
        .all(...params) as Record<string, unknown>[]

      for (const row of rows) {
        const date = String(row.date ?? '')
        const existing = activityMap.get(date) ?? {
          date,
          messageCount: 0,
          callCount: 0,
          tokenTotal: 0,
        }
        existing.callCount = toNumber(row.call_count)
        existing.tokenTotal = toNumber(row.token_total)
        activityMap.set(date, existing)
      }
    }
  }

  const activity = Array.from(activityMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  const summary = activity.reduce<ActivitySummary>(
    (acc, point) => {
      acc.totalMessages += point.messageCount
      acc.totalCalls += point.callCount
      acc.totalTokens += point.tokenTotal
      if (point.messageCount > 0 || point.callCount > 0 || point.tokenTotal > 0) {
        acc.activeDays += 1
      }
      return acc
    },
    { totalMessages: 0, totalCalls: 0, totalTokens: 0, totalSessions: 0, activeDays: 0 }
  )

  if (tableExists(db, 'session')) {
    const where: string[] = []
    const params: unknown[] = []
    applyDateRange('ts', range, where, params)
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const row = db
      .prepare(`SELECT COUNT(*) AS total FROM session ${whereSql}`)
      .get(...params) as Record<string, unknown>
    summary.totalSessions = toNumber(row?.total)
  }

  return { activity, summary }
}
