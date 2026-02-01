#!/usr/bin/env node
/**
 * Check if a session exists in the observability DB.
 * Usage: node scripts/check-session.js <session-id>
 * Uses same DB path as the app (CODEX_OBSERV_DB_PATH or ~/.codex-observ/data.db).
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { DatabaseSync } = require('node:sqlite')

function resolveDbPath() {
  const envPath = process.env.CODEX_OBSERV_DB_PATH
  if (envPath && envPath.trim().length > 0) {
    return envPath
  }
  return path.join(os.homedir(), '.codex-observ', 'data.db')
}

const sessionId = process.argv[2]
if (!sessionId) {
  console.error('Usage: node scripts/check-session.js <session-id>')
  process.exit(1)
}

const dbPath = resolveDbPath()
console.log('DB path:', dbPath)

if (!fs.existsSync(dbPath)) {
  console.error('DB file not found. Run ingestion first or set CODEX_OBSERV_DB_PATH.')
  process.exit(1)
}

const db = new DatabaseSync(dbPath)
const row = db.prepare('SELECT id, ts FROM session WHERE id = ?').get(sessionId)

if (!row) {
  console.log('Session not found in DB:', sessionId)
  const count = db.prepare('SELECT COUNT(*) AS n FROM session').get()
  console.log('Total sessions in DB:', count?.n ?? 0)
  process.exit(1)
}

console.log('Session found:', row.id)
console.log('  ts:', row.ts, new Date(Number(row.ts)).toISOString())
process.exit(0)
