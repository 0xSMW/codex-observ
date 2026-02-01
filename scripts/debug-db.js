const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

function resolveDbPath() {
  const envPath = process.env.CODEX_OBSERV_DB_PATH;
  if (envPath && envPath.trim().length > 0) {
    return envPath;
  }
  return path.join(os.homedir(), '.codex-observ', 'data.db');
}

const dbPath = resolveDbPath();
console.log('Opening DB at:', dbPath);

if (!fs.existsSync(dbPath)) {
  console.error('DB file not found!');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

function query(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.error('Query failed:', sql, e.message);
    return [];
  }
}

console.log('\n--- Sessions (Top 5) ---');
console.log(query('SELECT id, ts, duration_ms FROM session ORDER BY ts DESC LIMIT 5'));

console.log('\n--- Model Calls (Top 5) ---');
console.log(query('SELECT id, ts, model, total_tokens, duration_ms FROM model_call ORDER BY ts DESC LIMIT 5'));

console.log('\n--- Tool Calls (Top 5) ---');
console.log(query('SELECT id, start_ts, duration_ms, status FROM tool_call ORDER BY start_ts DESC LIMIT 5'));

console.log('\n--- Tool Status Counts ---');
console.log(query('SELECT status, COUNT(*) as count FROM tool_call GROUP BY status'));

console.log('\n--- Timestamps Range ---');
const sessionRange = query('SELECT MIN(ts) as min_ts, MAX(ts) as max_ts FROM session')[0];
console.log('Session TS Range:', sessionRange);
if (sessionRange.min_ts) {
    console.log('Min Session Date:', new Date(sessionRange.min_ts / 1000).toISOString()); // Assuming micros
    console.log('Max Session Date:', new Date(sessionRange.max_ts / 1000).toISOString());
}

const modelRange = query('SELECT MIN(ts) as min_ts, MAX(ts) as max_ts FROM model_call')[0];
console.log('Model TS Range:', modelRange);
