#!/usr/bin/env node
/**
 * Dashboard Data Verification Script
 *
 * Verifies that local Codex Observability data, the database, and API responses
 * are correct and consistent. Run with:
 *
 *   node scripts/verify-dashboard-data.mjs [--api-url=http://localhost:3000]
 *
 * Environment:
 *   CODEX_OBSERV_DB_PATH - path to data.db (default: ~/.codex-observ/data.db)
 *   API_URL - base URL for API (default: http://localhost:3000)
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { DatabaseSync } from 'node:sqlite'

// --- Config ---
const DB_PATH =
  process.env.CODEX_OBSERV_DB_PATH || path.join(os.homedir(), '.codex-observ', 'data.db')
const API_URL = process.env.API_URL || 'http://localhost:3000'
const API_ENABLED = !process.argv.includes('--no-api')

// --- Helpers ---
function log(section, message, data = null) {
  const prefix = `[${section}]`
  console.log(prefix, message, data ?? '')
}

function fail(section, message) {
  console.error(`[FAIL:${section}]`, message)
}

function pass(section, message) {
  console.log(`[PASS:${section}]`, message)
}

function toNumber(val, fallback = 0) {
  if (val === null || val === undefined) return fallback
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

function formatDate(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// --- Database queries (mirror lib/metrics logic) ---
function openDb() {
  if (!fs.existsSync(DB_PATH)) {
    fail('DB', `Database not found: ${DB_PATH}`)
    return null
  }
  try {
    return new DatabaseSync(DB_PATH)
  } catch (e) {
    fail('DB', `Failed to open: ${e.message}`)
    return null
  }
}

function tableExists(db, table) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)
  return Boolean(row?.name)
}

function applyRange(where, params, field, range) {
  if (range?.startMs !== undefined) {
    where.push(`${field} >= ?`)
    params.push(range.startMs)
  }
  if (range?.endMs !== undefined) {
    where.push(`${field} <= ?`)
    params.push(range.endMs)
  }
}

// --- Verification ---

function verifyTables(db) {
  log('DB', 'Checking tables...')
  const required = ['session', 'model_call', 'tool_call', 'message', 'daily_activity']
  const missing = required.filter((t) => !tableExists(db, t))
  if (missing.length > 0) {
    fail('DB', `Missing tables: ${missing.join(', ')}`)
  } else {
    pass('DB', `All tables exist`)
  }
  return missing.length === 0
}

function verifyDataRanges(db) {
  log('DB', 'Checking data timestamps...')

  const checks = [
    { table: 'session', col: 'ts' },
    { table: 'model_call', col: 'ts' },
    { table: 'tool_call', col: 'start_ts' },
    { table: 'message', col: 'ts' },
  ]

  for (const { table, col } of checks) {
    if (!tableExists(db, table)) continue
    const row = db
      .prepare(`SELECT MIN(${col}) as min_ts, MAX(${col}) as max_ts FROM ${table}`)
      .get()
    const minTs = toNumber(row?.min_ts)
    const maxTs = toNumber(row?.max_ts)
    if (minTs === 0 && maxTs === 0) {
      log('DB', `  ${table}: no data`)
    } else if (minTs === 0 || minTs < 1e12 || maxTs > Date.now() + 86400000) {
      fail('DB', `  ${table}: suspicious timestamps min=${minTs} max=${maxTs} (expected ms)`)
    } else {
      pass('DB', `  ${table}: ${formatDate(minTs)} .. ${formatDate(maxTs)}`)
    }
  }
}

function verifyOverviewMetrics(db, range) {
  log('DB', 'Verifying Overview metrics...')

  if (!tableExists(db, 'model_call')) {
    log('DB', '  No model_call table, skipping token metrics')
    return
  }

  const where = []
  const params = []
  applyRange(where, params, 'ts', range)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const tokenRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(input_tokens), 0) AS input_tokens,
        COALESCE(SUM(cached_input_tokens), 0) AS cached_input_tokens,
        COALESCE(SUM(total_tokens), 0) AS total_tokens,
        COUNT(*) AS model_calls
      FROM model_call ${whereSql}`
    )
    .get(...params)

  const totalTokens = toNumber(tokenRow?.total_tokens)
  const inputTokens = toNumber(tokenRow?.input_tokens)
  const cachedInput = toNumber(tokenRow?.cached_input_tokens)
  const cacheHitRate = inputTokens > 0 ? cachedInput / inputTokens : 0

  pass('DB', `  Total tokens: ${totalTokens}`)
  pass('DB', `  Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`)

  if (tableExists(db, 'tool_call')) {
    const toolWhere = []
    const toolParams = []
    applyRange(toolWhere, toolParams, 'start_ts', range)
    const toolWhereSql = toolWhere.length ? `WHERE ${toolWhere.join(' AND ')}` : ''

    const toolRow = db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_count
        FROM tool_call ${toolWhereSql}`
      )
      .get(...toolParams)

    const total = toNumber(toolRow?.total)
    const ok = toNumber(toolRow?.ok_count)
    const successRate = total > 0 ? ok / total : 0
    pass('DB', `  Tool success rate: ${(successRate * 100).toFixed(1)}% (${ok}/${total})`)
  }
}

function verifySessionsMetrics(db, range) {
  log('DB', 'Verifying Sessions metrics...')

  if (!tableExists(db, 'session')) {
    log('DB', '  No session table')
    return
  }

  const where = []
  const params = []
  applyRange(where, params, 's.ts', range)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const hasMessage = tableExists(db, 'message')
  const hasModelCall = tableExists(db, 'model_call')

  const msgSql = hasMessage ? '(SELECT COUNT(*) FROM message m WHERE m.session_id = s.id)' : '0'
  const tokensSql = hasModelCall
    ? '(SELECT COALESCE(SUM(total_tokens), 0) FROM model_call mc WHERE mc.session_id = s.id)'
    : '0'

  const rows = db
    .prepare(
      `SELECT s.id, ${msgSql} AS message_count, ${tokensSql} AS total_tokens
       FROM session s ${whereSql}
       ORDER BY s.ts DESC LIMIT 5`
    )
    .all(...params)

  if (rows.length === 0) {
    log('DB', '  No sessions in range')
    return
  }

  for (const r of rows) {
    const msgCount = toNumber(r?.message_count)
    const tokens = toNumber(r?.total_tokens)
    const id = (r?.id ?? '').slice(0, 8)
    pass('DB', `  Session ${id}: messages=${msgCount}, tokens=${tokens}`)
  }
}

function verifyActivityMetrics(db, range) {
  log('DB', 'Verifying Activity metrics...')

  const hasDaily = tableExists(db, 'daily_activity')
  const hasMessage = tableExists(db, 'message')
  const hasModelCall = tableExists(db, 'model_call')

  if (hasDaily) {
    const where = []
    const params = []
    if (range?.startMs !== undefined) {
      where.push('date >= ?')
      params.push(formatDate(range.startMs))
    }
    if (range?.endMs !== undefined) {
      where.push('date <= ?')
      params.push(formatDate(range.endMs))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = db
      .prepare(
        `SELECT date, message_count, call_count, token_total FROM daily_activity ${whereSql}`
      )
      .all(...params)
    pass('DB', `  daily_activity: ${rows.length} rows`)
  }

  if (!hasDaily || (hasMessage && hasModelCall)) {
    const activityMap = new Map()
    if (hasMessage) {
      const where = []
      const params = []
      applyRange(where, params, 'ts', range)
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db
        .prepare(
          `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS date, COUNT(*) AS cnt
           FROM message ${whereSql} GROUP BY date`
        )
        .all(...params)
      for (const r of rows) {
        activityMap.set(r.date, {
          ...(activityMap.get(r.date) ?? {}),
          messageCount: toNumber(r.cnt),
        })
      }
    }
    if (hasModelCall) {
      const where = []
      const params = []
      applyRange(where, params, 'ts', range)
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const rows = db
        .prepare(
          `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS date,
                  COUNT(*) AS calls, COALESCE(SUM(total_tokens), 0) AS tokens
           FROM model_call ${whereSql} GROUP BY date`
        )
        .all(...params)
      for (const r of rows) {
        const existing = activityMap.get(r.date) ?? {}
        existing.callCount = toNumber(r.calls)
        existing.tokenTotal = toNumber(r.tokens)
        activityMap.set(r.date, existing)
      }
    }
    pass('DB', `  Fallback activity: ${activityMap.size} days`)
  }
}

function verifyToolCallsMetrics(db, range) {
  log('DB', 'Verifying Tool Calls metrics...')

  if (!tableExists(db, 'tool_call')) {
    log('DB', '  No tool_call table')
    return
  }

  const where = []
  const params = []
  applyRange(where, params, 'start_ts', range)
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'ok' OR status = 'unknown' OR exit_code = 0 THEN 1 ELSE 0 END) AS ok_count
      FROM tool_call ${whereSql}`
    )
    .get(...params)

  const total = toNumber(row?.total)
  const ok = toNumber(row?.ok_count)
  const successRate = total > 0 ? ok / total : 0
  pass('DB', `  Tool calls: ${total}, success: ${ok}, rate: ${(successRate * 100).toFixed(1)}%`)
}

// --- API verification ---
async function verifyApiEndpoints(range) {
  if (!API_ENABLED) {
    log('API', 'Skipped (--no-api)')
    return
  }

  const startDate = range?.startMs ? new Date(range.startMs).toISOString() : null
  const endDate = range?.endMs ? new Date(range.endMs).toISOString() : null
  const qs =
    startDate && endDate
      ? `?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      : ''

  const endpoints = [
    { name: 'Overview', url: `/api/overview${qs}` },
    { name: 'Sessions', url: `/api/sessions${qs}&page=1&pageSize=5` },
    { name: 'Tool Calls', url: `/api/tool-calls${qs}&limit=5` },
    {
      name: 'Activity',
      url: `/api/activity?startDate=${encodeURIComponent(new Date(range?.startMs ?? 0).toISOString())}&endDate=${encodeURIComponent(new Date(range?.endMs ?? 0).toISOString())}`,
    },
  ]

  log('API', `Base URL: ${API_URL}`)

  for (const { name, url } of endpoints) {
    try {
      const res = await fetch(`${API_URL}${url}`)
      const ok = res.ok
      const data = ok ? await res.json() : null

      if (!ok) {
        fail('API', `${name}: ${res.status} ${res.statusText}`)
        continue
      }

      if (name === 'Overview') {
        const k = data?.kpis
        if (!k) fail('API', 'Overview: missing kpis')
        else {
          pass('API', `Overview totalTokens=${k.totalTokens?.value ?? '?'}`)
          pass('API', `Overview cacheHitRate=${((k.cacheHitRate?.value ?? 0) * 100).toFixed(1)}%`)
          pass('API', `Overview successRate=${((k.successRate?.value ?? 0) * 100).toFixed(1)}%`)
          pass('API', `Overview series days=${data?.series?.daily?.length ?? 0}`)
        }
      } else if (name === 'Sessions') {
        const sessions = data?.sessions ?? []
        pass('API', `Sessions: ${sessions.length} returned`)
        sessions.slice(0, 2).forEach((s) => {
          pass(
            'API',
            `  ${s.id?.slice(0, 8)}: messages=${s.messageCount}, tokens=${s.tokens?.total}`
          )
        })
      } else if (name === 'Tool Calls') {
        const s = data?.summary
        pass(
          'API',
          `Tool Calls: total=${s?.total}, successRate=${((s?.successRate ?? 0) * 100).toFixed(1)}%`
        )
        pass(
          'API',
          `  prevSuccessRate=${s?.prevSuccessRate != null ? (s.prevSuccessRate * 100).toFixed(1) + '%' : 'null'}`
        )
      } else if (name === 'Activity') {
        const act = data?.activity ?? []
        const sum = data?.summary ?? {}
        pass(
          'API',
          `Activity: ${act.length} days, totalMessages=${sum.totalMessages}, totalTokens=${sum.totalTokens}`
        )
      }
    } catch (e) {
      fail('API', `${name}: ${e.message}`)
    }
  }
}

// --- Main ---
async function main() {
  console.log('\n=== Codex Observability Dashboard Verification ===\n')
  console.log('DB path:', DB_PATH)
  console.log('API URL:', API_URL)
  console.log('')

  const db = openDb()
  if (!db) process.exit(1)

  const now = new Date()
  const endMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startMs = endMs - 29 * 24 * 60 * 60 * 1000
  const range = { startMs, endMs }

  verifyTables(db)
  verifyDataRanges(db)
  verifyOverviewMetrics(db, range)
  verifySessionsMetrics(db, range)
  verifyActivityMetrics(db, range)
  verifyToolCallsMetrics(db, range)

  await verifyApiEndpoints(range)

  console.log('\n=== Done ===\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
