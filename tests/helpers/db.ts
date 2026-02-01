import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { getTestDbPath } from '../setup'

function openTestDb(): DatabaseSync {
  const dbPath = getTestDbPath()
  return new DatabaseSync(dbPath)
}

export interface DateRange {
  startMs?: number
  endMs?: number
}

export function queryTokenTotals(range?: DateRange) {
  const db = openTestDb()
  const where: string[] = []
  const params: unknown[] = []
  if (range?.startMs != null) {
    where.push('ts >= ?')
    params.push(range.startMs)
  }
  if (range?.endMs != null) {
    where.push('ts <= ?')
    params.push(range.endMs)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*) AS model_calls
      FROM model_call ${whereSql}`
    )
    .get(...params) as Record<string, number> | undefined
  return {
    inputTokens: row?.input_tokens ?? 0,
    cachedInputTokens: row?.cached_input_tokens ?? 0,
    totalTokens: row?.total_tokens ?? 0,
    modelCalls: row?.model_calls ?? 0,
  }
}

export function querySessionsCount(range?: DateRange): number {
  const db = openTestDb()
  const where: string[] = []
  const params: unknown[] = []
  if (range?.startMs != null) {
    where.push('ts >= ?')
    params.push(range.startMs)
  }
  if (range?.endMs != null) {
    where.push('ts <= ?')
    params.push(range.endMs)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db.prepare(`SELECT COUNT(*) AS cnt FROM session ${whereSql}`).get(...params) as
    | { cnt: number }
    | undefined
  return row?.cnt ?? 0
}

export function queryToolCallsCount(range?: DateRange) {
  const db = openTestDb()
  const where: string[] = []
  const params: unknown[] = []
  if (range?.startMs != null) {
    where.push('start_ts >= ?')
    params.push(range.startMs)
  }
  if (range?.endMs != null) {
    where.push('start_ts <= ?')
    params.push(range.endMs)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR (exit_code IS NOT NULL AND exit_code = 0) THEN 1 ELSE 0 END) AS ok
      FROM tool_call ${whereSql}`
    )
    .get(...params) as Record<string, number> | undefined
  const total = row?.total ?? 0
  const ok = row?.ok ?? 0
  return { total, ok, successRate: total > 0 ? ok / total : 0 }
}

export function querySessionIds(range?: DateRange, limit = 5): string[] {
  const db = openTestDb()
  const where: string[] = []
  const params: unknown[] = []
  if (range?.startMs != null) {
    where.push('ts >= ?')
    params.push(range.startMs)
  }
  if (range?.endMs != null) {
    where.push('ts <= ?')
    params.push(range.endMs)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT id FROM session ${whereSql} ORDER BY ts DESC LIMIT ?`)
    .all(...params, limit) as { id: string }[]
  return rows.map((r) => r.id)
}
