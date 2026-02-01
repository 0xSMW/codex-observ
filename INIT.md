# Codex Observability Micro App — Architecture + Plan

## Goal

Build a lightweight, fast, local-only observability app that continuously visualizes Codex CLI usage from `~/.codex` with great UX.

## Core Metrics (must have)

- Token usage (input, cached input, output, reasoning, total)
- Cache utilization (cached_input / input) + trend
- # of conversations (sessions)
- # of model calls
- Which users are using Codex and when (best-effort; see Data Notes)
- Terminal type (best-effort)
- Success rate of calls
- User decisions for tool calls (accept/reject)
- # of requests over time
- Request duration
- Additional conversation details (project/cwd, model, provider, effort, approval policy)

## Non‑Goals (for v1)

- Cloud sync or multi-device aggregation
- Long-term archival beyond what Codex already stores
- Full CLI command playback or transcript export UI

## Data Sources (local)

Primary:

- `~/.codex/sessions/**/rollout-*.jsonl` (session stream)
- `~/.codex/history.jsonl` (first prompt timestamp)
- `~/.codex/log/codex-tui.log` (tool call logs + background events + errors)
- `~/.codex/models_cache.json` (model metadata if useful)
- `~/.codex/config.toml` (context about environment if needed)

Optional:

- `~/.codex/auth.json` (if user identity is present; do NOT store secrets)

## Data Notes / Reality Checks

- "Users using Codex" is not explicitly stored in `sessions/*.jsonl`. If we want a user identifier, we can:
  - Default to local OS username (single-user machine).
  - Attempt to extract user identity from `auth.json` only if safe and not a secret (otherwise hash/omit).
- "Terminal type" may not be in session events. We can:
  - Parse `codex-tui.log` if it logs terminal info.
  - Fallback to reading `TERM` at runtime for the current machine (best-effort).
- "Success rate of calls" and "user decisions (accept/reject)" are easiest from `codex-tui.log` (FunctionCall entries + BackgroundEvent failures). We will compute approximate pairing by timestamp + command signature if no explicit IDs exist.

## Architecture (lightweight, local-first)

**Stack**

- App: Next.js (App Router) for UI + API routes
- UI: shadcn/ui components + Tailwind CSS v4
- Storage: SQLite (via `better-sqlite3` or `bun:sqlite`) for fast local queries
- Charts: shadcn/ui chart components (Recharts under the hood)
- Live updates: file watchers + incremental ingestion + SSE or websocket endpoint

**Process model**

- Single Next.js server serves UI + API.
- On startup, ingest existing data into SQLite.
- Run a background watcher (within the server process) to tail JSONL/log files and incrementally update metrics.
- Provide a quick "ingest state" table so re-runs are fast.

## Finalized Schema

Below is a concise, implementation-ready SQLite schema. All timestamps are Unix ms unless stated.

### `ingest_state`

Tracks incremental ingestion per source file.

- `path` TEXT **PK**
- `byte_offset` INTEGER **NOT NULL**
- `mtime_ms` INTEGER NULL
- `updated_at` INTEGER **NOT NULL**

Indexes:

- `idx_ingest_state_updated_at` on (`updated_at`)

### `session`

One record per Codex session file or `session_meta` block.

- `id` TEXT **PK**
- `ts` INTEGER **NOT NULL**
- `cwd` TEXT NULL
- `originator` TEXT NULL
- `cli_version` TEXT NULL
- `model_provider` TEXT NULL
- `git_branch` TEXT NULL
- `git_commit` TEXT NULL
- `source_file` TEXT **NOT NULL**
- `source_line` INTEGER **NOT NULL**
- `dedup_key` TEXT **NOT NULL**

Indexes:

- `idx_session_ts` on (`ts`)
- `idx_session_dedup_key` **UNIQUE** on (`dedup_key`)

### `message`

Minimal message envelope (content optional and opt‑in).

- `id` TEXT **PK**
- `session_id` TEXT **NOT NULL** → `session(id)`
- `role` TEXT **NOT NULL** -- “user” | “assistant” | “system”
- `ts` INTEGER **NOT NULL**
- `content` TEXT NULL -- store only if user opts in
- `source_file` TEXT **NOT NULL**
- `source_line` INTEGER **NOT NULL**
- `dedup_key` TEXT **NOT NULL**

Indexes:

- `idx_message_session_ts` on (`session_id`, `ts`)
- `idx_message_dedup_key` **UNIQUE** on (`dedup_key`)

### `model_call`

Token_count events (one per model invocation/response).

- `id` TEXT **PK**
- `session_id` TEXT **NOT NULL** → `session(id)`
- `ts` INTEGER **NOT NULL**
- `model` TEXT NULL
- `input_tokens` INTEGER **NOT NULL**
- `cached_input_tokens` INTEGER **NOT NULL**
- `output_tokens` INTEGER **NOT NULL**
- `reasoning_tokens` INTEGER **NOT NULL**
- `total_tokens` INTEGER **NOT NULL**
- `duration_ms` INTEGER NULL -- if present from event
- `source_file` TEXT **NOT NULL**
- `source_line` INTEGER **NOT NULL**
- `dedup_key` TEXT **NOT NULL**

Indexes:

- `idx_model_call_session_ts` on (`session_id`, `ts`)
- `idx_model_call_ts` on (`ts`)
- `idx_model_call_dedup_key` **UNIQUE** on (`dedup_key`)

### `tool_call`

Normalized, merged tool execution record (derived from `tool_call_event`).

- `id` TEXT **PK**
- `session_id` TEXT NULL -- may be null if log doesn’t include session
- `tool_name` TEXT **NOT NULL** -- e.g., `exec_command`
- `command` TEXT NULL -- best‑effort representation
- `status` TEXT **NOT NULL** -- “ok” | “failed” | “unknown”
- `start_ts` INTEGER **NOT NULL**
- `end_ts` INTEGER NULL
- `duration_ms` INTEGER NULL
- `exit_code` INTEGER NULL
- `error` TEXT NULL
- `stdout_bytes` INTEGER NULL
- `stderr_bytes` INTEGER NULL
- `source_file` TEXT **NOT NULL**
- `source_line` INTEGER **NOT NULL**
- `correlation_key` TEXT **NOT NULL**
- `dedup_key` TEXT **NOT NULL**

Indexes:

- `idx_tool_call_ts` on (`start_ts`)
- `idx_tool_call_session_ts` on (`session_id`, `start_ts`)
- `idx_tool_call_status` on (`status`)
- `idx_tool_call_correlation_key` on (`correlation_key`)
- `idx_tool_call_dedup_key` **UNIQUE** on (`dedup_key`)

### `tool_call_event`

Raw tool log events (fine‑grained for correlation + debugging).

- `id` TEXT **PK**
- `session_id` TEXT NULL
- `tool_name` TEXT **NOT NULL**
- `event_type` TEXT **NOT NULL** -- “start” | “stdout” | “stderr” | “exit” | “failure”
- `ts` INTEGER **NOT NULL**
- `payload` TEXT NULL -- trimmed / redacted line
- `exit_code` INTEGER NULL
- `source_file` TEXT **NOT NULL**
- `source_line` INTEGER **NOT NULL**
- `correlation_key` TEXT **NOT NULL**
- `dedup_key` TEXT **NOT NULL**

Indexes:

- `idx_tool_event_ts` on (`ts`)
- `idx_tool_event_session_ts` on (`session_id`, `ts`)
- `idx_tool_event_corr_ts` on (`correlation_key`, `ts`)
- `idx_tool_event_dedup_key` **UNIQUE** on (`dedup_key`)

### `daily_activity`

Lightweight materialized rollup (optional, can be rebuilt).

- `date` TEXT **PK** -- YYYY‑MM‑DD local
- `message_count` INTEGER **NOT NULL**
- `call_count` INTEGER **NOT NULL**
- `token_total` INTEGER **NOT NULL**

Indexes:

- `idx_daily_activity_date` on (`date`)

### De‑dup key strategy

- `dedup_key = sha256(source_file + ":" + source_line + ":" + stable_payload_hash)` (truncate to 16–24 hex chars).
- Use `INSERT OR IGNORE` or `ON CONFLICT(dedup_key) DO NOTHING`.
- Set `id = dedup_key` unless a native ID exists in the payload.

### Tool call correlation

- `correlation_key` from call id if present; else hash of `tool_name + start_ts + command_hash + source_file`.
- `event_type = start` creates or looks up `tool_call` with `start_ts`.
- `event_type = exit` or `failure` sets `end_ts`, `exit_code`, `status`, `error`.
- `duration_ms = end_ts - start_ts` when both exist; else NULL.
- If `exit_code != 0`, mark `status = failed`.

### SQLite constraints & FKs

- Enable FKs: `PRAGMA foreign_keys = ON`.
- `message.session_id` → `session.id` (ON DELETE CASCADE)
- `model_call.session_id` → `session.id` (ON DELETE CASCADE)
- `tool_call.session_id` → `session.id` (ON DELETE SET NULL)
- `tool_call_event.session_id` → `session.id` (ON DELETE SET NULL)

## Ingestion Pipeline

1. Enumerate files in `~/.codex/sessions/YYYY/MM/DD/*.jsonl`.
2. For each file, read incrementally using `ingest_state` offset.
3. Parse JSON lines:
   - `session_meta` → `session`
   - `response_item` (role = user/assistant) → `message`
   - `event_msg` with `payload.type == "token_count"` → `model_call`
   - `turn_context` → update session/model context for later events
4. Parse `codex-tui.log` (line-based; may include ANSI):
   - Extract `FunctionCall:` → `tool_call` start
   - Extract `BackgroundEvent: Execution failed` → `tool_call` failure + exit code
   - Extract "ToolCall: exec_command …" (newer format) as tool calls
5. Compute derived metrics on demand or via lightweight materialized tables.

## Metrics Definitions (clear + deterministic)

- **Model calls**: count of `token_count` events.
- **Token totals**: sum of token_count deltas, per model and per day.
- **Cache utilization**: `cached_input_tokens / input_tokens` (guard divide-by-zero).
- **Conversations**: count of session files or session ids from `session_meta`.
- **Request duration**: prefer explicit duration if available, else compute from tool logs (start → output/exit) within a window.
- **Success rate**:
  - `successful_tool_calls / total_tool_calls` where success is missing failure event or exit_code == 0.
- **User decisions**:
  - If logs indicate approve/reject explicitly, compute directly.
  - Otherwise: infer from tool call execution (executed = accepted). Show "estimated".

## Performance Targets

- Cold start ingest: < 5s for 100k lines
- Incremental ingest: < 100ms per new line burst
- UI render: < 200ms per page

## Security & Privacy

- [x] Local-only data storage, no outbound telemetry.
- [x] Ignore/strip secrets (auth tokens, raw user prompts) unless user opts in.
- [x] .gitignore all local DB + cache files.

---

# Multi-Agent Execution Plan

## Progress Summary (validated 2026-02-01)

**Phase 1 setup**: Complete — Runtime, Recharts, schema, api types, metrics types in place.

**Agent A (Ingestion)**: ~95% — DB (node:sqlite), schema, file discovery, JSONL parsers, log ingestion, dedup, fixtures, smoke scripts. _Open_: file rotation handling.

**Agent B (Logs)**: Complete — ANSI strip, FunctionCall/ToolCall/BackgroundEvent parsers, tool correlation, identity resolution, terminal detection, fixtures, log-parse-smoke.

**Agent C (API)**: ~95% — All routes (overview, sessions, models, providers, tool-calls, activity, ingest) implemented. _Open_: api-smoke.ts contract tests.

**Agent D (UI)**: ~90% — shadcn, custom theme (light/dark/system), app shell, sidebar, header, overview KPIs+charts, sessions table, session detail, activity heatmap, data hooks. _Open_: @tanstack/react-table/virtual, api-smoke.

**Agent E (Live updates)**: ~95% — fs.watch-based watcher, SSE `/api/events`, useLiveUpdates, incremental ingest on file change, profiler, cache. _Open_: `/api/health` endpoint.

**Implementation variations from plan**:

| Plan                       | Implemented                         |
| -------------------------- | ----------------------------------- |
| better-sqlite3             | `node:sqlite` (built-in)            |
| chokidar for file watching | native `fs.watch`                   |
| next-themes                | custom ThemeProvider (localStorage) |
| SWR for data fetching      | custom `useApiData` hook            |

---

## Orchestrator (Agent 0) — Coordination & Integration

### Phase 1: Setup & Contracts

- [x] **Decision: Runtime** — Use Node.js (broader ecosystem, stable SQLite bindings)
- [x] **Decision: Chart library** — Use Recharts (React-native, composable, works well with shadcn)
- [x] **Create `src/lib/db/schema.ts`** — TypeScript types matching SQLite tables
- [x] **Create `src/types/api.ts`** — Shared request/response types for all API endpoints
- [x] **Create `src/types/metrics.ts`** — Type definitions for all computed metrics
- [ ] **Document file ownership** — Assign files to agents to prevent conflicts

### Phase 2: Integration & Merge

- [ ] **Review Agent A output** — Validate schema implementation and ingestion logic
- [ ] **Review Agent B output** — Verify log parsing accuracy with sample data
- [ ] **Review Agent C output** — Test API endpoints return correct types
- [ ] **Review Agent D output** — UI/UX quality check against design specs
- [ ] **Review Agent E output** — Performance validation against targets
- [ ] **Resolve conflicts** — Merge changes, fix type mismatches, run full test suite
- [ ] **Final integration test** — End-to-end flow from data ingestion to UI render

### Orchestration Best Practices (apply during execution)

- Single owner per file: avoid parallel edits to the same path.
- Orchestrator owns cross-cutting files: `package.json`, `globals.css`, `next.config.ts`, app shell, and shared types.
- Agents must keep scope tight: max 2–3 deliverables and no “bonus refactors”.
- Require evidence: agents cite exact file paths and commands run.
- Timebox and interrupt: if an agent stalls, request partial output.
- Merge order: A + B → C → D → E (avoid UI work waiting on API).
- Use fixtures early: UI agent can stub with JSON fixtures until APIs are ready.

### File Ownership Map (no overlap)

- **Orchestrator**: `package.json`, `pnpm-lock.yaml`, `src/app/layout.tsx`, `src/app/globals.css`, `src/types/**`
- **Agent A**: `src/lib/db/**`, `src/lib/ingestion/**`, `scripts/ingest-smoke.ts`
- **Agent B**: `src/lib/identity/**`, `src/lib/ingestion/log-parser.ts`, `scripts/log-parse-smoke.ts`
- **Agent C**: `src/app/api/**`, `src/lib/metrics/**`, `scripts/api-smoke.ts`
- **Agent D**: `src/app/**` pages, `src/components/**`, `src/hooks/**`
- **Agent E**: `src/lib/watcher/**`, `src/lib/performance/**`, `src/app/api/events/**`, `src/hooks/use-live-updates.ts`

---

## Agent A — Core Ingestion + Schema

### Scope

Implement the SQLite database layer and JSONL ingestion pipeline for session data.

### Files to Create/Edit

```
src/lib/db/
├── index.ts           # Database singleton + connection
├── schema.sql         # Raw SQL schema
├── migrations.ts      # Schema versioning
└── queries/
    ├── sessions.ts    # Session CRUD operations
    ├── messages.ts    # Message CRUD operations
    ├── model-calls.ts # Model call CRUD operations
    └── ingest-state.ts # Ingest state tracking

src/lib/ingestion/
├── index.ts           # Main ingestion orchestrator
├── file-discovery.ts  # Find all JSONL files
├── jsonl-reader.ts    # Incremental JSONL parser
├── parsers/
│   ├── session-meta.ts
│   ├── response-item.ts
│   ├── event-msg.ts
│   └── turn-context.ts
└── dedup.ts           # Deterministic ID generation
```

### Tasks (Detailed)

#### Database Setup

- [x] Install `better-sqlite3` and `@types/better-sqlite3` _(uses `node:sqlite` built-in instead)_
- [x] Create database singleton in `src/lib/db/index.ts`
  - Lazy initialization on first access
  - Store DB file at `~/.codex-observ/data.db`
  - Enable WAL mode for concurrent reads
- [x] Write `schema.sql` with all tables from Data Model section
  - Add indexes: `session(ts)`, `model_call(session_id, ts)`, `tool_call(ts)`
  - Add foreign key constraints (disabled by default in SQLite, enable explicitly)
- [x] Implement migration system with version tracking
  - Store current version in `pragma user_version`
  - Run migrations on startup if version mismatch

#### File Discovery

- [x] Implement `discoverSessionFiles(codexHome: string): string[]`
  - Recursively scan `~/.codex/sessions/YYYY/MM/DD/`
  - Return files sorted by modification time (oldest first for consistent ingestion)
  - Handle missing directories gracefully
- [x] Implement `discoverHistoryFile(codexHome: string): string | null`
- [x] Add file existence caching to avoid repeated fs.stat calls

#### Incremental JSONL Reader

- [x] Implement `IngestState` table operations
  - `getOffset(path: string): number`
  - `setOffset(path: string, offset: number): void`
- [x] Implement `readJsonlIncremental(path: string, fromOffset: number)`
  - Use `fs.createReadStream` with `start` option
  - Parse lines with proper error handling (skip malformed lines, log warning)
  - Return `{ lines: ParsedLine[], newOffset: number }`
- [ ] Handle file rotation (detect if file shrunk, reset offset)

#### Parsers

- [x] `parseSessionMeta(line: object)` → `Session` record
  - Extract: id, timestamp, cwd, originator, cli_version, model_provider
  - Extract git info if present: branch, commit
- [x] `parseResponseItem(line: object)` → `Message` record
  - Extract: id, session_id, role (user/assistant), timestamp
  - Generate deterministic ID from session_id + timestamp + role
- [x] `parseEventMsg(line: object)` → `ModelCall` record (if token_count)
  - Extract all token fields: input, cached_input, output, reasoning, total
  - Handle missing fields with defaults (0)
- [x] `parseTurnContext(line: object)` → Session context update
  - Update model/provider info for subsequent events in same session

#### Deduplication

- [x] Implement `generateRecordId(filePath: string, lineNumber: number, payload: object): string`
  - Use SHA-256 hash truncated to 16 chars
  - Ensure deterministic across re-runs
- [x] Add upsert logic to all insert operations (INSERT OR REPLACE)

#### Main Ingestion Orchestrator

- [x] Implement `ingestAll(codexHome: string): IngestResult`
  - Discover files → read incrementally → parse → insert → update offset
  - Return stats: `{ filesProcessed, linesIngested, errors }`
- [x] Add progress callback for UI feedback during cold start
- [x] Implement batch inserts (100 records per transaction) for performance

#### Fixtures & Smoke Tests

- [x] Add `src/lib/ingestion/__fixtures__/` with small JSONL samples:
  - `session_meta` line
  - `response_item` line
  - `event_msg` token_count line
  - `turn_context` line
- [x] Add `scripts/ingest-smoke.ts` to run ingestion against fixtures and print counts
- [x] Add `pnpm ingest:smoke` script for quick validation

### Output Format

```typescript
// src/lib/db/index.ts exports
export function getDb(): Database
export function closeDb(): void

// src/lib/ingestion/index.ts exports
export async function ingestAll(codexHome?: string): Promise<IngestResult>
export async function ingestIncremental(codexHome?: string): Promise<IngestResult>

interface IngestResult {
  filesProcessed: number
  linesIngested: number
  errors: Array<{ file: string; line: number; error: string }>
  durationMs: number
}
```

### Validation Criteria

- [ ] Cold start ingestion completes in < 5s for 100k lines
- [ ] Re-running ingestion on same data produces identical DB state
- [ ] Handles malformed JSON lines without crashing
- [ ] Works with empty `~/.codex/sessions/` directory

---

## Agent B — Logs + Tool-Call Analytics

### Scope

Parse `codex-tui.log` to extract tool call data, success/failure rates, and user identity heuristics.

### Files to Create/Edit

```
src/lib/ingestion/
├── log-parser.ts       # Main TUI log parser
├── ansi-strip.ts       # ANSI escape code removal
└── parsers/
    ├── function-call.ts   # FunctionCall: extraction
    ├── background-event.ts # BackgroundEvent: extraction
    └── tool-call.ts       # ToolCall: extraction (newer format)

src/lib/db/queries/
└── tool-calls.ts       # Tool call CRUD + analytics queries

src/lib/identity/
├── index.ts            # User identity resolution
├── os-user.ts          # OS username extraction
└── auth-parser.ts      # Safe auth.json parsing
```

### Tasks (Detailed)

#### ANSI Stripping

- [x] Implement `stripAnsi(text: string): string`
  - Remove all ANSI escape sequences (colors, cursor movement, etc.)
  - Use regex: `/\x1B\[[0-9;]*[A-Za-z]/g` and extended sequences
  - Preserve actual content and timestamps

#### Log Line Parsing

- [x] Implement `parseLogLine(line: string): LogEvent | null`
  - Extract timestamp (format: `YYYY-MM-DD HH:MM:SS.mmm` or similar)
  - Identify event type from prefix patterns
  - Return structured object or null for irrelevant lines

#### FunctionCall Parser

- [x] Parse lines matching `FunctionCall:` pattern
  - Extract: command/function name, arguments (if present)
  - Extract: timestamp, correlation ID (if present)
  - Generate deterministic ID for dedup
- [x] Handle multi-line function calls (arguments may span lines)

#### BackgroundEvent Parser

- [x] Parse lines matching `BackgroundEvent:` pattern
  - Identify failure events: "Execution failed", "Error", etc.
  - Extract: exit code, error message, stderr snippet
  - Correlate with preceding FunctionCall by timestamp proximity (< 5 min window)

#### ToolCall Parser (Newer Format)

- [x] Parse lines matching `ToolCall: exec_command` pattern
  - Extract: command, arguments, working directory
  - Extract: status (pending/running/completed/failed)
  - Extract: duration if present

#### Tool Call Correlation

- [x] Implement `correlateToolCalls(functionCalls: FunctionCall[], events: BackgroundEvent[]): ToolCallRecord[]`
  - Match start events to completion/failure events
  - Use timestamp + command signature for matching
  - Mark unmatched function calls as "unknown" status
  - Calculate duration where possible

#### User Identity Resolution

- [x] Implement `resolveUserIdentity(codexHome: string): UserIdentity`
  - Primary: OS username via `os.userInfo().username`
  - Secondary: Parse `auth.json` for safe fields only
    - Extract: email domain (hash the local part), provider name
    - NEVER extract: tokens, API keys, full email
  - Return: `{ username: string, source: 'os' | 'auth' }`

#### Terminal Type Detection

- [x] Implement `detectTerminalType(): TerminalInfo`
  - Read `TERM` environment variable
  - Read `TERM_PROGRAM` if available (iTerm2, Terminal.app, etc.)
  - Parse TUI logs for terminal capability info if present
  - Return: `{ type: string, program: string | null }`

#### Database Integration

- [x] Create `tool_call` insert/update operations
- [x] Create analytics queries:
  - `getToolCallSuccessRate(dateRange?): number`
  - `getTopFailingCommands(limit: number): Array<{command, failCount, lastError}>`
  - `getAverageToolCallDuration(dateRange?): number`
  - `getToolCallsByStatus(): Record<Status, number>`

#### Fixtures & Validation

- [x] Add `src/lib/ingestion/__fixtures__/codex-tui.log` with representative lines:
  - `FunctionCall:` entries
  - `ToolCall: exec_command` entries
  - `BackgroundEvent: Execution failed` entries
- [x] Add `scripts/log-parse-smoke.ts` to parse fixture log and print call counts
- [x] Ensure ANSI stripping handles colorized prefixes and timestamps

### Output Format

```typescript
// src/lib/ingestion/log-parser.ts exports
export async function parseLogFile(logPath: string, fromOffset?: number): Promise<LogParseResult>

interface LogParseResult {
  toolCalls: ToolCallRecord[]
  newOffset: number
  errors: ParseError[]
}

// src/lib/identity/index.ts exports
export function resolveUserIdentity(codexHome?: string): UserIdentity
export function detectTerminalType(): TerminalInfo
```

### Validation Criteria

- [ ] Correctly parses sample TUI log with various event types
- [ ] ANSI stripping preserves all meaningful content
- [ ] Tool call correlation accuracy > 90% on test data
- [ ] Never leaks secrets from auth.json

---

## Agent C — Metrics API

### Scope

Build all API endpoints that serve computed metrics to the frontend.

### Files to Create/Edit

```
src/app/api/
├── overview/route.ts      # KPIs + time series
├── sessions/route.ts      # Paged session list
├── sessions/[id]/route.ts # Single session detail
├── models/route.ts        # Model usage stats
├── providers/route.ts     # Provider breakdown
├── tool-calls/route.ts    # Tool call analytics
├── activity/route.ts      # Activity heatmap data
└── ingest/route.ts        # Trigger manual ingest + status

src/lib/metrics/
├── index.ts               # Metrics computation orchestrator
├── tokens.ts              # Token aggregations
├── cache.ts               # Cache utilization calculations
├── sessions.ts            # Session statistics
├── models.ts              # Model usage analytics
├── tool-calls.ts          # Tool call success/failure
└── activity.ts            # Daily activity aggregations
```

### Tasks (Detailed)

#### API Route: `/api/overview`

- [x] Implement GET handler returning `OverviewResponse`
- [ ] Query params: `startDate`, `endDate` (ISO strings, optional)
- [ ] Response structure:
  ```typescript
  {
    kpis: {
      totalTokens: number
      cachedTokens: number
      outputTokens: number
      cacheUtilization: number // 0-1
      sessionCount: number
      modelCallCount: number
      toolCallSuccessRate: number // 0-1
    }
    timeSeries: {
      tokens: Array<{ date: string; input: number; cached: number; output: number }>
      modelCalls: Array<{ date: string; count: number }>
      cacheUtilization: Array<{ date: string; rate: number }>
    }
    lastUpdated: string // ISO timestamp
  }
  ```
- [ ] Add caching layer (recompute only if data changed)

#### API Route: `/api/sessions`

- [x] Implement GET handler with pagination
- [ ] Query params: `page`, `limit`, `sortBy`, `sortOrder`, `model`, `provider`, `search`
- [ ] Response structure:
  ```typescript
  {
    sessions: Array<{
      id: string
      timestamp: string
      project: string // extracted from cwd
      cwd: string
      model: string
      provider: string
      messageCount: number
      totalTokens: number
      duration: number | null
    }>
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
  ```
- [ ] Implement full-text search on cwd/project

#### API Route: `/api/sessions/[id]`

- [x] Implement GET handler for single session detail
- [ ] Return: session metadata, all messages, all model calls, associated tool calls
- [ ] Include computed session-level metrics

#### API Route: `/api/models`

- [x] Implement GET handler returning model usage stats
- [ ] Query params: `startDate`, `endDate`
- [ ] Response structure:
  ```typescript
  {
    models: Array<{
      name: string
      provider: string
      callCount: number
      totalTokens: number
      avgTokensPerCall: number
      cacheUtilization: number
      estimatedCost: number | null // if pricing available
    }>
    topModel: string
    totalModels: number
  }
  ```

#### API Route: `/api/providers`

- [x] Implement GET handler returning provider breakdown
- [ ] Response includes: call counts, token totals, model lists per provider

#### API Route: `/api/tool-calls`

- [x] Implement GET handler returning tool call analytics
- [ ] Query params: `startDate`, `endDate`, `status`, `command`
- [ ] Response structure:
  ```typescript
  {
    summary: {
      total: number
      successful: number
      failed: number
      unknown: number
      successRate: number
      avgDuration: number | null
    }
    topFailures: Array<{
      command: string
      count: number
      lastError: string
      lastOccurred: string
    }>
    byDay: Array<{
      date: string
      total: number
      successful: number
      failed: number
    }>
  }
  ```

#### API Route: `/api/activity`

- [x] Implement GET handler returning activity heatmap data
- [ ] Query params: `year` (default: current year)
- [ ] Response: 365 days of activity counts (GitHub-style)
  ```typescript
  {
    year: number
    days: Array<{
      date: string // YYYY-MM-DD
      messageCount: number
      modelCalls: number
      tokens: number
      level: 0 | 1 | 2 | 3 | 4 // intensity bucket
    }>
    maxDaily: number
  }
  ```

#### API Route: `/api/ingest`

- [x] Implement POST handler to trigger manual re-ingestion
- [x] Implement GET handler to return current ingest status
- [ ] Response: `{ status: 'idle' | 'running', lastRun: string, lastResult: IngestResult }`

#### Metrics Computation Layer

- [x] Implement efficient SQL queries with proper indexing
- [x] Add query result caching with TTL (invalidate on new data)
- [x] Handle edge cases: no data, divide by zero, null values
- [x] Implement date range filtering consistently across all metrics

#### Contract Tests

- [ ] Add `scripts/api-smoke.ts` to call each endpoint and validate JSON shape _(not present)_
- [ ] Add `src/types/api.ts` runtime guards (lightweight manual checks)
- [ ] Ensure error responses use a consistent shape: `{ error, code }`

### Output Format

All API routes should:

- Return JSON with consistent error format: `{ error: string, code: string }`
- Include `Cache-Control` headers for appropriate caching
- Log query performance for debugging

### Validation Criteria

- [ ] All endpoints return valid JSON matching TypeScript types
- [ ] Pagination works correctly (no duplicates, correct totals)
- [ ] Date filtering works across all endpoints
- [ ] Response time < 100ms for typical queries

---

## Agent D — UI/UX (High-Quality shadcn Implementation)

### Scope

Build a beautiful, accessible, performant dashboard using shadcn/ui with dark/light/system theme support.

### Ownership & Boundaries

- Owns only UI + hooks: `src/app/**`, `src/components/**`, `src/hooks/**`, and `src/lib/constants.ts`.
- Do **not** modify ingestion, DB, or API logic (Agent A/B/C).
- Cross-cutting styling changes in `src/app/globals.css` must be coordinated with Orchestrator.

### Execution Slices (order matters)

1. **Shell + Navigation** — app shell, sidebar, header, theme toggle.
2. **Overview Page** — KPI grid + primary charts (tokens, cache, calls).
3. **Tables + Filters** — sessions list, tools list, pagination + filters.
4. **Secondary Pages** — models/providers, activity heatmap, session detail.
5. **States + Accessibility** — loading, empty, error, keyboard, SR labels.
6. **Performance Pass** — dynamic import for charts, memoization, render budgets.

### Files to Create/Edit

```
src/
├── app/
│   ├── layout.tsx              # Root layout with theme provider
│   ├── page.tsx                # Overview dashboard
│   ├── sessions/
│   │   ├── page.tsx            # Sessions list
│   │   └── [id]/page.tsx       # Session detail
│   ├── models/page.tsx         # Models & providers
│   ├── tools/page.tsx          # Tool calls
│   └── activity/page.tsx       # Activity heatmap
├── components/
│   ├── ui/                     # shadcn components (generated)
│   ├── layout/
│   │   ├── app-shell.tsx       # Main layout wrapper
│   │   ├── sidebar.tsx         # Navigation sidebar
│   │   ├── header.tsx          # Top header with controls
│   │   └── theme-toggle.tsx    # Dark/light/system toggle
│   ├── dashboard/
│   │   ├── kpi-card.tsx        # Metric card component
│   │   ├── kpi-grid.tsx        # Grid of KPI cards
│   │   ├── chart-card.tsx      # Chart wrapper with title
│   │   ├── tokens-chart.tsx    # Token usage over time
│   │   ├── cache-chart.tsx     # Cache utilization trend
│   │   └── calls-chart.tsx     # Model calls over time
│   ├── sessions/
│   │   ├── sessions-table.tsx  # Virtualized session table
│   │   ├── session-filters.tsx # Filter controls
│   │   └── session-detail.tsx  # Session detail view
│   ├── tools/
│   │   ├── success-gauge.tsx   # Success rate visualization
│   │   ├── failures-table.tsx  # Top failing commands
│   │   └── duration-chart.tsx  # Duration distribution
│   ├── activity/
│   │   └── heatmap.tsx         # GitHub-style activity heatmap
│   └── shared/
│       ├── date-range-picker.tsx
│       ├── loading-skeleton.tsx
│       ├── empty-state.tsx
│       ├── error-boundary.tsx
│       └── status-badge.tsx
├── hooks/
│   ├── use-overview.ts         # Overview data fetching
│   ├── use-sessions.ts         # Sessions with pagination
│   ├── use-models.ts           # Model stats
│   ├── use-tool-calls.ts       # Tool call analytics
│   ├── use-activity.ts         # Activity heatmap data
│   └── use-theme.ts            # Theme management
└── lib/
    ├── utils.ts                # Utility functions (cn, formatters)
    └── constants.ts            # Colors, breakpoints, etc.
```

### shadcn/ui Setup Tasks

- [x] Initialize shadcn/ui: `pnpm dlx shadcn@latest init`
  - Style: New York (refined, professional look)
  - Base color: Zinc (professional, works well for dashboards)
  - CSS variables: Yes
  - Tailwind CSS: Yes (already installed)
  - Components location: `src/components/ui`
  - Utils location: `src/lib/utils`
- [ ] Install required components:
  ```bash
  pnpm dlx shadcn@latest add button card badge table tabs
  pnpm dlx shadcn@latest add dropdown-menu select input
  pnpm dlx shadcn@latest add skeleton tooltip popover
  pnpm dlx shadcn@latest add separator scroll-area
  pnpm dlx shadcn@latest add navigation-menu sheet sidebar
  ```
- [ ] Install additional dependencies:
  ```bash
  pnpm add recharts @tanstack/react-table @tanstack/react-virtual
  pnpm add next-themes lucide-react date-fns
  pnpm add swr # for data fetching with caching
  ```

### Theme System (Dark/Light/System)

#### Implementation Tasks

- [x] Install and configure `next-themes` _(custom ThemeProvider with localStorage used instead)_
- [x] Create `src/components/providers/theme-provider.tsx` _(in `use-theme.tsx` as ThemeProvider)_:

  ```typescript
  'use client'
  import { ThemeProvider as NextThemesProvider } from 'next-themes'

  export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return (
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </NextThemesProvider>
    )
  }
  ```

- [x] Create `src/components/layout/theme-toggle.tsx`:
  - Three-state toggle: Light / Dark / System
  - Use `DropdownMenu` from shadcn for selection
  - Show current effective theme (sun/moon/monitor icon)
  - Animate icon transition smoothly
- [x] Update `src/app/layout.tsx`:
  - Wrap app in `ThemeProvider`
  - Add `suppressHydrationWarning` to `<html>` tag
  - Set `className` to enable dark mode: `dark:bg-background`
- [x] Configure Tailwind for dark mode (already set via shadcn init)

#### Color Palette Guidelines

- [x] Use shadcn CSS variables for all colors (automatically theme-aware)
- [ ] Define chart colors in `globals.css` with dark mode variants:
  ```css
  :root {
    --chart-1: 221 83% 53%; /* Blue - Primary data */
    --chart-2: 142 71% 45%; /* Green - Success/positive */
    --chart-3: 38 92% 50%; /* Amber - Warning/cached */
    --chart-4: 262 83% 58%; /* Purple - Secondary metric */
    --chart-5: 0 84% 60%; /* Red - Error/failure */
  }
  .dark {
    --chart-1: 217 91% 60%;
    --chart-2: 142 76% 36%;
    --chart-3: 38 92% 50%;
    --chart-4: 263 70% 50%;
    --chart-5: 0 72% 51%;
  }
  ```
- [ ] Success/failure semantic colors using shadcn conventions:
  - Success: `text-emerald-600 dark:text-emerald-400`
  - Warning: `text-amber-600 dark:text-amber-400`
  - Error: `text-red-600 dark:text-red-400`
  - Info: `text-blue-600 dark:text-blue-400`

### UI Best Practices for Exceptional Quality

#### Non‑negotiables (shadcn quality bar)

- Use shadcn primitives as intended: `Card`, `Tabs`, `Table`, `Badge`, `Popover`, `Tooltip`, `Sheet`.
- Use `ChartContainer`, `ChartTooltip`, `ChartLegend` from shadcn chart component (no custom wrappers).
- Never hardcode colors; use CSS variables and tokenized classes (`text-foreground`, `bg-card`, etc.).
- Keep typography consistent (defined scale) and use `tabular-nums` for metrics.
- Avoid dense layouts: maintain generous spacing and clear hierarchy.
- Ensure dark/light parity: every visual choice must look correct in both.

#### Layout & Spacing

- [ ] Use consistent spacing scale (Tailwind 4px base): `space-y-4`, `gap-6`, `p-6`
- [ ] Maintain visual hierarchy with proper heading sizes:
  - Page title: `text-2xl font-semibold tracking-tight`
  - Section title: `text-lg font-medium`
  - Card title: `text-sm font-medium`
- [ ] Use `max-w-screen-2xl mx-auto` for content constraint
- [ ] Implement responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`
- [ ] Add proper padding on mobile (min `px-4 sm:px-6`)
- [ ] Use consistent border radius: shadcn's `rounded-lg` (0.5rem)

#### Typography

- [ ] Use system font stack (Inter preferred if available)
- [ ] KPI values: `text-2xl sm:text-3xl font-bold tabular-nums tracking-tight`
- [ ] Secondary/muted text: `text-muted-foreground text-sm`
- [ ] Labels: `text-sm font-medium`
- [ ] Truncate long text with `truncate` class + tooltip on hover
- [ ] Use `tabular-nums` for any numbers that update or align in columns

#### Component Patterns

##### KPI Cards

- [ ] Consistent card structure with proper spacing:
  ```tsx
  <Card className="hover:shadow-md transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
      <Coins className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold tabular-nums">1,234,567</div>
      <p className="text-xs text-muted-foreground mt-1">
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">+12.5%</span> from last
        period
      </p>
    </CardContent>
  </Card>
  ```
- [ ] Add loading skeleton that matches exact dimensions
- [ ] Subtle hover effect for interactive cards
- [ ] Use icons from `lucide-react` consistently (4x4 for card headers)

##### Data Tables

- [ ] Use `@tanstack/react-table` for feature-rich tables
- [ ] Implement virtual scrolling with `@tanstack/react-virtual` for 100+ rows
- [ ] Table styling:
  ```tsx
  <Table>
    <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-10">
      <TableRow className="hover:bg-transparent">
        <TableHead className="font-medium">Column</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow className="hover:bg-muted/50 cursor-pointer">
        <TableCell className="font-medium">Value</TableCell>
      </TableRow>
    </TableBody>
  </Table>
  ```
- [ ] Sortable columns with visual indicator (chevron icon)
- [ ] Loading state: skeleton rows matching table structure exactly
- [ ] Empty state: centered message with icon and helpful action

##### Charts (shadcn/ui + Recharts)

- [ ] Use `ChartContainer` with Recharts inside (shadcn chart composition)
- [ ] Use `ChartTooltip` + `ChartTooltipContent`, `ChartLegend` + `ChartLegendContent`
- [ ] Responsive container with fixed aspect ratio:
  ```tsx
  <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
    <AreaChart data={data}>
      <defs>
        <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
          <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis
        dataKey="date"
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        stroke="hsl(var(--muted-foreground))"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={(value) => `${value.toLocaleString()}`}
      />
      <ChartTooltip content={<ChartTooltipContent />} />
      <Area
        type="monotone"
        dataKey="tokens"
        stroke="hsl(var(--chart-1))"
        fill="url(#colorTokens)"
        strokeWidth={2}
      />
    </AreaChart>
  </ChartContainer>
  ```
- [ ] Custom tooltip matching shadcn style:
  ```tsx
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null
    return (
      <div className="rounded-lg border bg-background p-3 shadow-md">
        <p className="text-sm font-medium">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-sm text-muted-foreground">
            {entry.name}:{' '}
            <span className="font-medium text-foreground">{entry.value.toLocaleString()}</span>
          </p>
        ))}
      </div>
    )
  }
  ```
- [ ] Use gradient fills for area charts (more polished look)
- [ ] Consistent axis styling (no axis lines, subtle tick marks)

##### Activity Heatmap

- [ ] GitHub-contribution style grid implementation:
  - 53 columns (weeks) × 7 rows (days of week)
  - Cell size: 10-12px with 2px gap
  - Rounded corners: `rounded-sm`
- [ ] Color intensity levels (5 levels: 0-4):

  ```css
  /* Light mode */
  .level-0 {
    background: hsl(var(--muted));
  }
  .level-1 {
    background: hsl(142 76% 80%);
  }
  .level-2 {
    background: hsl(142 76% 60%);
  }
  .level-3 {
    background: hsl(142 76% 45%);
  }
  .level-4 {
    background: hsl(142 76% 30%);
  }

  /* Dark mode */
  .dark .level-0 {
    background: hsl(var(--muted));
  }
  .dark .level-1 {
    background: hsl(142 76% 20%);
  }
  .dark .level-2 {
    background: hsl(142 76% 30%);
  }
  .dark .level-3 {
    background: hsl(142 76% 40%);
  }
  .dark .level-4 {
    background: hsl(142 76% 50%);
  }
  ```

- [ ] Tooltip on hover showing: date, message count, token count
- [ ] Legend showing intensity scale
- [ ] Month labels along the top
- [ ] Day-of-week labels on the left (Mon, Wed, Fri)

#### Loading & Empty States

- [ ] Skeleton loading that matches final layout exactly:
  ```tsx
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20 mt-2" />
    </CardContent>
  </Card>
  ```
- [ ] Empty states with helpful messaging and clear action:
  ```tsx
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="rounded-full bg-muted p-4 mb-4">
      <Inbox className="h-8 w-8 text-muted-foreground" />
    </div>
    <h3 className="text-lg font-semibold">No sessions found</h3>
    <p className="mt-2 text-sm text-muted-foreground max-w-sm">
      Sessions will appear here once Codex CLI starts logging data.
    </p>
    <Button className="mt-4" variant="outline">
      Refresh Data
    </Button>
  </div>
  ```
- [ ] Error states with retry action:
  ```tsx
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="rounded-full bg-destructive/10 p-4 mb-4">
      <AlertCircle className="h-8 w-8 text-destructive" />
    </div>
    <h3 className="text-lg font-semibold">Failed to load data</h3>
    <p className="mt-2 text-sm text-muted-foreground max-w-sm">{error.message}</p>
    <Button className="mt-4" onClick={retry}>
      Try Again
    </Button>
  </div>
  ```

#### Accessibility

- [ ] All interactive elements have visible focus styles (shadcn default ring)
- [ ] Color contrast meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- [ ] Don't rely solely on color for meaning (use icons, patterns, labels)
- [ ] Tables have proper `scope` attributes on headers
- [ ] Charts have descriptive `aria-label` and summary text
- [ ] Keyboard navigation for all interactive elements
- [ ] Respect `prefers-reduced-motion` for animations
- [ ] Screen reader announcements for live data updates

#### Animations & Transitions

- [ ] Subtle, purposeful animations only:

  ```tsx
  // Page transitions
  className = 'animate-in fade-in-0 slide-in-from-bottom-4 duration-500'

  // Card hover
  className = 'transition-shadow hover:shadow-md'

  // Data update highlight
  className = 'transition-colors duration-300'
  ```

- [ ] Respect reduced motion preference:
  ```tsx
  className = 'motion-safe:animate-pulse'
  ```
- [ ] No animations longer than 300ms for UI feedback
- [ ] Loading spinners for async operations > 200ms

#### Performance

- [ ] Use `next/dynamic` for heavy components (charts):
  ```tsx
  const TokensChart = dynamic(() => import('@/components/dashboard/tokens-chart'), {
    ssr: false,
    loading: () => <ChartSkeleton />,
  })
  ```
- [ ] Implement `React.memo` for expensive renders
- [ ] Debounce filter/search inputs (300ms)
- [ ] Use SWR for data fetching with stale-while-revalidate:
  ```tsx
  const { data, error, isLoading, mutate } = useSWR('/api/overview', fetcher, {
    refreshInterval: 30000, // Auto-refresh every 30s
    revalidateOnFocus: true,
  })
  ```
- [ ] Prefetch adjacent pages in pagination
- [ ] Image optimization with `next/image` for any icons/images

### Detailed Component Tasks

#### App Shell (`src/components/layout/app-shell.tsx`)

- [x] Use shadcn sidebar component as base
- [ ] Collapsible sidebar on desktop (icon-only mode with tooltip labels)
- [ ] Sheet-based sidebar on mobile (hamburger trigger in header)
- [ ] Persist sidebar collapsed state in localStorage
- [ ] Navigation items with:
  - Active state: `bg-accent text-accent-foreground`
  - Hover state: `hover:bg-accent/50`
  - Icon + label (label hidden when collapsed)
- [ ] Footer section with:
  - "Last updated" timestamp with relative time (e.g., "2 minutes ago")
  - Refresh button with loading spinner
  - Connection status indicator (SSE status)

#### Header (`src/components/layout/header.tsx`)

- [x] Sticky header: `sticky top-0 z-40 bg-background/95 backdrop-blur`
- [ ] Contains:
  - Mobile menu trigger (hamburger)
  - Page title / breadcrumb
  - Date range picker (right side)
  - Theme toggle (right side)
- [ ] Responsive: hide certain elements on mobile

#### Theme Toggle (`src/components/layout/theme-toggle.tsx`)

- [x] Three-state dropdown using shadcn DropdownMenu:
  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setTheme('light')}>
        <Sun className="mr-2 h-4 w-4" />
        Light
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('dark')}>
        <Moon className="mr-2 h-4 w-4" />
        Dark
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme('system')}>
        <Monitor className="mr-2 h-4 w-4" />
        System
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  ```
- [ ] Show checkmark next to current selection
- [ ] Keyboard accessible

#### Overview Dashboard (`src/app/page.tsx`)

- [x] 4-column KPI grid (1 col mobile, 2 col tablet, 4 col desktop)
- [ ] KPIs: Total Tokens, Cache Hit Rate, Sessions, Success Rate
- [ ] Each KPI shows: value, trend indicator, comparison to previous period
- [ ] Charts section below KPIs:
  - Tokens over time (Area chart with gradient)
  - Model calls over time (Bar chart)
  - Cache utilization trend (Line chart)
- [ ] Date range picker defaults to last 30 days
- [ ] Auto-refresh indicator (subtle pulsing dot when connected)
- [ ] Quick navigation cards to detailed views

#### Sessions Table (`src/components/sessions/sessions-table.tsx`)

- [x] Columns: Time, Project, Model, Messages, Tokens, Duration
- [ ] Features:
  - Sortable columns (click header to sort)
  - Column visibility toggle
  - Row click navigates to detail view
  - Virtualized for 1000+ rows
- [ ] Filter bar above table:
  - Search input (debounced, searches project/cwd)
  - Model dropdown (multi-select)
  - Provider dropdown
  - Date range (uses shared date picker state)
- [ ] Pagination controls below table:
  - Page size selector (10, 25, 50, 100)
  - Page navigation with total count

#### Session Detail (`src/app/sessions/[id]/page.tsx`)

- [x] Header: Project name, timestamp, model badge, duration
- [ ] Metadata cards: Token breakdown, message count, tool calls
- [ ] Timeline view of messages (alternating user/assistant)
- [ ] Model calls list with token details
- [ ] Associated tool calls with status badges
- [ ] Back navigation to sessions list

#### Activity Heatmap (`src/app/activity/page.tsx`)

- [x] Full-width heatmap component
- [ ] Year selector dropdown (last 3 years available)
- [ ] Summary stats above heatmap:
  - Total contributions this year
  - Longest streak
  - Current streak
  - Most active day
- [ ] Tooltip on cell hover with detailed stats

### Data Fetching Hooks

- [x] Use SWR for all data fetching with consistent pattern _(custom `useApiData` + `useApi` used instead)_:

  ```tsx
  export function useOverview(dateRange: DateRange) {
    const params = new URLSearchParams({
      startDate: dateRange.from.toISOString(),
      endDate: dateRange.to.toISOString(),
    })

    return useSWR<OverviewResponse>(`/api/overview?${params}`, fetcher, {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    })
  }
  ```

- [ ] Implement error boundaries with retry UI
- [ ] Share date range state via React Context
- [ ] Global SWR config in provider:
  ```tsx
  <SWRConfig value={{
    fetcher,
    onError: (error) => console.error(error),
    shouldRetryOnError: true,
    errorRetryCount: 3,
  }}>
  ```

### Output Format

- All components properly typed with TypeScript (no `any`)
- Export from barrel files: `components/dashboard/index.ts`
- Include JSDoc comments for complex props
- Colocate component + types + styles

### Validation Criteria

- [ ] Lighthouse accessibility score ≥ 95
- [ ] Lighthouse performance score ≥ 90
- [ ] No layout shift on data load (CLS < 0.1)
- [ ] Theme toggle works without flash on page load (FOUC prevented)
- [ ] All text readable in both light and dark modes (contrast check)
- [ ] Charts render correctly in both themes
- [ ] Mobile layout fully usable on 320px width
- [ ] All interactive elements keyboard accessible
- [ ] Screen reader can navigate all content

---

## Agent E — Live Updates + Performance

### Scope

Implement real-time data updates via file watching and optimize overall performance.

### Files to Create/Edit

```
src/lib/watcher/
├── index.ts               # Main watcher orchestrator
├── file-watcher.ts        # File system watcher implementation
├── debounce.ts            # Debounce utility for rapid changes
└── events.ts              # Event types for watcher

src/app/api/
├── events/route.ts        # SSE endpoint for live updates
└── health/route.ts        # Health check endpoint

src/hooks/
└── use-live-updates.ts    # Client-side SSE consumer

src/lib/performance/
├── profiler.ts            # Performance measurement utilities
└── cache.ts               # In-memory cache layer
```

### Tasks (Detailed)

#### File Watcher Implementation

- [x] Install `chokidar` for cross-platform file watching _(uses native `fs.watch` instead)_
- [x] Implement `SessionWatcher` class:
  - Watch `~/.codex/sessions/` recursively for new/changed `.jsonl` files
  - Watch `~/.codex/log/codex-tui.log` for new entries
  - Debounce rapid changes (100ms window)
  - Emit events: `session-updated`, `log-updated`, `file-added`
- [ ] Handle watcher errors gracefully (permission denied, file deleted)
- [ ] Implement watcher lifecycle: start, stop, restart
- [ ] Cleanup on process exit (remove all watchers)

#### Server-Sent Events (SSE) Endpoint

- [x] Implement `/api/events` SSE endpoint:

  ```typescript
  export async function GET(request: Request) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: object) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`))
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        // Subscribe to watcher events
        const unsubscribe = watcher.subscribe((event) => {
          send(event.type, event.payload)
        })

        // Heartbeat every 30s
        const heartbeat = setInterval(() => {
          send('heartbeat', { timestamp: Date.now() })
        }, 30000)

        // Cleanup on close
        request.signal.addEventListener('abort', () => {
          unsubscribe()
          clearInterval(heartbeat)
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }
  ```

- [ ] Event types to send:
  - `data-updated`: new data available, client should refetch
  - `ingest-progress`: during re-ingestion, send progress %
  - `ingest-complete`: ingestion finished with stats
  - `error`: something went wrong (include error message)
  - `heartbeat`: keep connection alive
- [ ] Handle multiple concurrent connections efficiently
- [ ] Graceful degradation if SSE not supported

#### Client-Side Live Updates

- [x] Implement `useLiveUpdates()` hook:

  ```typescript
  export function useLiveUpdates() {
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const { mutate } = useSWRConfig()

    useEffect(() => {
      let eventSource: EventSource
      let reconnectTimeout: NodeJS.Timeout
      let reconnectAttempts = 0

      const connect = () => {
        eventSource = new EventSource('/api/events')

        eventSource.onopen = () => {
          setStatus('connected')
          reconnectAttempts = 0
        }

        eventSource.addEventListener('data-updated', () => {
          setLastUpdate(new Date())
          // Revalidate all SWR caches
          mutate(() => true)
        })

        eventSource.onerror = () => {
          setStatus('disconnected')
          eventSource.close()
          // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
          reconnectTimeout = setTimeout(connect, delay)
          reconnectAttempts++
        }
      }

      connect()

      return () => {
        eventSource?.close()
        clearTimeout(reconnectTimeout)
      }
    }, [mutate])

    return { status, lastUpdate }
  }
  ```

- [ ] Visual feedback for live updates:
  - Connection status indicator in sidebar footer
  - Subtle highlight animation on updated data (optional)
  - "Last updated X ago" with live countdown
- [ ] Connection states:
  - Connected: green dot + "Live"
  - Reconnecting: yellow dot + "Reconnecting..."
  - Disconnected: red dot + "Offline" + manual refresh button

#### Incremental Ingest on File Change

- [x] On watcher event, trigger incremental ingest for changed file only
- [ ] Batch rapid changes (multiple files in 500ms window) into single ingest run
- [ ] Update `ingest_state` atomically
- [ ] Broadcast `data-updated` SSE event after successful ingest
- [ ] Log ingest performance for monitoring

#### Performance Profiling

- [x] Implement performance measurement utility:

  ```typescript
  export async function measureAsync<T>(
    name: string,
    fn: () => Promise<T>,
    threshold = 100
  ): Promise<T> {
    const start = performance.now()
    const result = await fn()
    const duration = performance.now() - start

    if (duration > threshold) {
      console.warn(`[PERF] ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`)
    }

    return result
  }
  ```

- [ ] Add profiling to critical paths:
  - Ingestion pipeline (per-file and total)
  - API endpoint handlers (each route)
  - Complex database queries
- [ ] Log slow operations (> 100ms) with details
- [ ] Create `/api/health` endpoint _(not present; sync-status exists instead)_:
  ```typescript
  {
    "status": "healthy",
    "uptime": 3600,
    "version": "1.0.0",
    "db": {
      "size": "12.5 MB",
      "sessionCount": 1234,
      "messageCount": 45678
    },
    "watcher": {
      "running": true,
      "watchedFiles": 42,
      "lastEvent": "2024-01-15T10:30:00Z"
    },
    "performance": {
      "avgIngestTime": 45,
      "avgApiResponseTime": 12,
      "p99ApiResponseTime": 89
    }
  }
  ```

#### Query Performance Optimization

- [x] Analyze query patterns with EXPLAIN QUERY PLAN
- [ ] Add database indexes based on actual query patterns:
  ```sql
  CREATE INDEX idx_session_ts ON session(ts DESC);
  CREATE INDEX idx_model_call_session ON model_call(session_id);
  CREATE INDEX idx_model_call_ts ON model_call(ts DESC);
  CREATE INDEX idx_tool_call_ts ON tool_call(ts DESC);
  CREATE INDEX idx_daily_activity_date ON daily_activity(date DESC);
  ```
- [x] Implement query result caching:

  ```typescript
  const cache = new Map<string, { data: unknown; expires: number }>()

  export function cachedQuery<T>(key: string, query: () => T, ttlMs = 30000): T {
    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) {
      return cached.data as T
    }

    const data = query()
    cache.set(key, { data, expires: Date.now() + ttlMs })
    return data
  }
  ```

- [ ] Cache invalidation on `data-updated` events
- [ ] Pre-compute daily rollups into `daily_activity` table on ingest

#### UI Render Performance

- [ ] Profile React renders with React DevTools Profiler
- [ ] Add `React.memo` to expensive components:
  - Chart components
  - Table rows
  - KPI cards (when props unchanged)
- [ ] Implement virtualization for tables > 100 rows
- [ ] Lazy load chart libraries with next/dynamic
- [ ] Optimize re-renders:
  - Use `useMemo` for expensive computations
  - Use `useCallback` for event handlers passed to children
  - Ensure SWR hooks have stable keys

#### Cold Start Optimization

- [ ] Implement progressive loading strategy:
  1. Show UI shell immediately (< 100ms)
  2. Load cached/stale data from localStorage if available
  3. Fetch fresh data in background
  4. Start ingestion if needed (show progress)
  5. Update UI as data streams in
- [ ] Add startup time logging:
  ```typescript
  console.log(`[STARTUP] Shell rendered: ${shellTime}ms`)
  console.log(`[STARTUP] Data loaded: ${dataTime}ms`)
  console.log(`[STARTUP] Fully interactive: ${totalTime}ms`)
  ```
- [ ] Target: Time to interactive < 2s

### Output Format

```typescript
// src/lib/watcher/index.ts
export function startWatcher(codexHome?: string): void
export function stopWatcher(): void
export function getWatcherStatus(): WatcherStatus
export function subscribe(callback: (event: WatcherEvent) => void): () => void

interface WatcherStatus {
  running: boolean
  watchedPaths: string[]
  lastEvent: Date | null
  errors: string[]
}

// src/hooks/use-live-updates.ts
export function useLiveUpdates(): {
  status: 'connecting' | 'connected' | 'disconnected'
  lastUpdate: Date | null
}
```

### Validation Criteria

- [ ] SSE connection established within 1s of page load
- [ ] New data appears in UI within 2s of file change
- [ ] No memory leaks after 1hr of watching (heap size stable ± 10%)
- [ ] Watcher handles 100+ files without performance degradation
- [ ] Graceful handling of `~/.codex` directory not existing
- [ ] Reconnection works reliably after network interruption
- [ ] CPU usage < 5% when idle (no file changes)

---

## Agent Dependencies & Execution Order

```
┌─────────────────────────────────────────────────────────┐
│                    Agent 0 (Orchestrator)                │
│                 Setup contracts & types                  │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │   Agent A     │               │   Agent B     │
    │  Ingestion    │               │  Log Parser   │
    │  + Schema     │               │  + Analytics  │
    └───────────────┘               └───────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
                    ┌───────────────┐
                    │   Agent C     │
                    │  Metrics API  │
                    └───────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │   Agent D     │               │   Agent E     │
    │   UI/UX       │◄─────────────►│ Live Updates  │
    │   (shadcn)    │               │ + Performance │
    └───────────────┘               └───────────────┘
```

**Parallel execution opportunities:**

- Agent A + B can run simultaneously after Orchestrator setup
- Agent D can start early with mock data/fixture endpoints
- Agent E starts after A + C are functional

**Integration checkpoints:**

1. After A + B: Verify data is correctly ingested and queryable
2. After C: API contracts match frontend TypeScript types
3. After D + E: Full integration test with live data

---

## Open Questions / Decisions

### Resolved

- **Runtime**: Node.js (stable ecosystem, better SQLite bindings)
- **Chart library**: Recharts (React-native, composable, good dark mode support)
- **Theme system**: next-themes with system preference detection
- **UI component library**: shadcn/ui with New York style
- **Message storage**: Counts only for visualization — raw messages are already stored in Codex's local storage (`~/.codex/sessions/`), so we only need aggregate counts for metrics and charts. No need to duplicate raw message content in SQLite.
- **CLI export**: Not needed — no CLI export functionality required. Users can access raw data directly from `~/.codex/` if needed.
- **Multi-user support**: Not supported — this is a local single-user application designed for personal use on one machine. No authentication, user management, or multi-tenant features.
- **Cost estimation**: Yes, included — use pricing data from LiteLLM's [model_prices_and_context_window.json](https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json) for all Codex-supported models including:
  - GPT-5, GPT-5.2, GPT-5.2 Codex
  - o3, o3-mini, o4-mini
  - And other models as listed in the pricing JSON
  - Implementation: Fetch and cache the JSON periodically (daily), compute cost per model call using `input_tokens × input_price + output_tokens × output_price`

### Remaining

(All initial decisions resolved for v1)
