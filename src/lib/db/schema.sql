-- Schema for Codex Observability (SQLite)

CREATE TABLE IF NOT EXISTS ingest_state (
  path TEXT PRIMARY KEY,
  byte_offset INTEGER NOT NULL,
  mtime_ms INTEGER NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingest_state_updated_at ON ingest_state(updated_at);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  cwd TEXT NULL,
  originator TEXT NULL,
  cli_version TEXT NULL,
  model_provider TEXT NULL,
  git_branch TEXT NULL,
  git_commit TEXT NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  dedup_key TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_session_dedup_key ON session(dedup_key);
CREATE INDEX IF NOT EXISTS idx_session_ts ON session(ts);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  ts INTEGER NOT NULL,
  content TEXT NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  dedup_key TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_dedup_key ON message(dedup_key);
CREATE INDEX IF NOT EXISTS idx_message_session_ts ON message(session_id, ts);

CREATE TABLE IF NOT EXISTS model_call (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  model TEXT NULL,
  input_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  duration_ms INTEGER NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  dedup_key TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_call_dedup_key ON model_call(dedup_key);
CREATE INDEX IF NOT EXISTS idx_model_call_session_ts ON model_call(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_model_call_ts ON model_call(ts);

CREATE TABLE IF NOT EXISTS tool_call (
  id TEXT PRIMARY KEY,
  session_id TEXT NULL,
  tool_name TEXT NOT NULL,
  command TEXT NULL,
  status TEXT NOT NULL,
  start_ts INTEGER NOT NULL,
  end_ts INTEGER NULL,
  duration_ms INTEGER NULL,
  exit_code INTEGER NULL,
  error TEXT NULL,
  stdout_bytes INTEGER NULL,
  stderr_bytes INTEGER NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  correlation_key TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_call_dedup_key ON tool_call(dedup_key);
CREATE INDEX IF NOT EXISTS idx_tool_call_ts ON tool_call(start_ts);
CREATE INDEX IF NOT EXISTS idx_tool_call_session_ts ON tool_call(session_id, start_ts);
CREATE INDEX IF NOT EXISTS idx_tool_call_status ON tool_call(status);
CREATE INDEX IF NOT EXISTS idx_tool_call_correlation_key ON tool_call(correlation_key);

CREATE TABLE IF NOT EXISTS tool_call_event (
  id TEXT PRIMARY KEY,
  session_id TEXT NULL,
  tool_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload TEXT NULL,
  exit_code INTEGER NULL,
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  correlation_key TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES session(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_event_dedup_key ON tool_call_event(dedup_key);
CREATE INDEX IF NOT EXISTS idx_tool_event_ts ON tool_call_event(ts);
CREATE INDEX IF NOT EXISTS idx_tool_event_session_ts ON tool_call_event(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_tool_event_corr_ts ON tool_call_event(correlation_key, ts);

CREATE TABLE IF NOT EXISTS daily_activity (
  date TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL,
  call_count INTEGER NOT NULL,
  token_total INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_date ON daily_activity(date);
