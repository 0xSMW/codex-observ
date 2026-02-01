export type IngestStateRow = {
  path: string
  byte_offset: number
  mtime_ms: number | null
  updated_at: number
}

export type SessionRow = {
  id: string
  ts: number
  cwd: string | null
  originator: string | null
  cli_version: string | null
  model_provider: string | null
  git_branch: string | null
  git_commit: string | null
  source_file: string
  source_line: number
  dedup_key: string
}

export type MessageRow = {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'system'
  ts: number
  content: string | null
  source_file: string
  source_line: number
  dedup_key: string
}

export type ModelCallRow = {
  id: string
  session_id: string
  ts: number
  model: string | null
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  reasoning_tokens: number
  total_tokens: number
  duration_ms: number | null
  source_file: string
  source_line: number
  dedup_key: string
}

export type ToolCallRow = {
  id: string
  session_id: string | null
  tool_name: string
  command: string | null
  status: 'ok' | 'failed' | 'unknown'
  start_ts: number
  end_ts: number | null
  duration_ms: number | null
  exit_code: number | null
  error: string | null
  stdout_bytes: number | null
  stderr_bytes: number | null
  source_file: string
  source_line: number
  correlation_key: string
  dedup_key: string
}

export type ToolCallEventRow = {
  id: string
  session_id: string | null
  tool_name: string
  event_type: 'start' | 'stdout' | 'stderr' | 'exit' | 'failure'
  ts: number
  payload: string | null
  exit_code: number | null
  source_file: string
  source_line: number
  correlation_key: string
  dedup_key: string
}

export type DailyActivityRow = {
  date: string // YYYY-MM-DD
  message_count: number
  call_count: number
  token_total: number
}

export type Insertable<T> = {
  [K in keyof T]: T[K] | null
}
