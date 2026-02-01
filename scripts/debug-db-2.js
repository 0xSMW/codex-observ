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

const db = new DatabaseSync(resolveDbPath());

function query(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (e) {
    console.error('Query failed:', sql, e.message);
    return [];
  }
}

console.log('\n--- Check for 0 timestamps in Session related tables ---');
// Check if any timestamps are 0 which would cause the 1970/491k hour bug
console.log('Session TS=0:', query('SELECT count(*) as c FROM session WHERE ts = 0')[0]);
console.log('Message TS=0:', query('SELECT count(*) as c FROM message WHERE ts = 0')[0]);
console.log('Model Call TS=0:', query('SELECT count(*) as c FROM model_call WHERE ts = 0')[0]);
console.log('Tool Call StartTS=0:', query('SELECT count(*) as c FROM tool_call WHERE start_ts = 0')[0]);

// Check Min TS again
console.log('Min Message TS:', query('SELECT MIN(ts) as min FROM message')[0]);
console.log('Min Model TS:', query('SELECT MIN(ts) as min FROM model_call')[0]);
console.log('Min Tool TS:', query('SELECT MIN(start_ts) as min FROM tool_call')[0]);


console.log('\n--- Models List Query Test ---');
// Replicating the logic from models.ts
const modelsQuery = `
  SELECT
    model,
    COUNT(*) AS call_count,
    COALESCE(SUM(input_tokens), 0) AS input_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens
  FROM model_call
  GROUP BY model
  ORDER BY total_tokens DESC
  LIMIT 10
`;
console.log(query(modelsQuery));

console.log('\n--- Sessions List Query Test (Duration) ---');
// Replicating a simplified version of the sessions query to see the raw aggregated TS values
const sessionQuery = `
  SELECT
    s.id,
    s.ts,
    (SELECT MIN(ts) FROM model_call mc WHERE mc.session_id = s.id) AS first_model_ts,
    (SELECT MAX(ts) FROM model_call mc WHERE mc.session_id = s.id) AS last_model_ts,
    (SELECT MIN(ts) FROM message m WHERE m.session_id = s.id) AS first_message_ts,
    (SELECT MIN(start_ts) FROM tool_call tc WHERE tc.session_id = s.id) AS first_tool_ts
  FROM session s
  ORDER BY s.ts DESC
  LIMIT 5
`;
console.log(query(sessionQuery));
