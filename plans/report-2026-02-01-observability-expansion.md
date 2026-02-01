# Observability Expansion Spec (2026-02-01)

## 1. Executive Summary

This report analyzes the JSONL sources currently ingested for observability and identifies insights that are available in those records but not surfaced in the UI today. The ingestion pipeline reads Codex session JSONL files and the Codex TUI log, storing session metadata, messages, model-call token usage, and tool-call executions in SQLite. The ingested fields already include project-identifying signals (cwd/project/repo), git branch/commit, originator, and CLI version that could power project, branch, and worktree filters. Tool-call logs capture exit codes, stderr/stdout byte counts, and error text, but the UI only surfaces tool name, command, status, and duration. Event messages include reasoning token counts and cached input tokens that are not exposed per-call or per-session in detail views. The schema also includes tables that are currently unused (tool_call_event, daily_activity), indicating room to store richer time-series and event timelines. This spec proposes an additive expansion focused on project-aware analytics, deeper tool diagnostics, and richer model-call breakdowns while keeping existing behavior identical. The expansion is designed to use the existing JSON fields first, with optional enrichment (repo remote, worktree detection) gated and clearly separated.

## 2. Scope Reviewed

- `src/lib/ingestion/index.ts` (ingest loop, session + log handling)
- `src/lib/ingestion/file-discovery.ts` (session file discovery)
- `src/lib/ingestion/jsonl-reader.ts` (incremental JSONL reads)
- `src/lib/ingestion/parsers/session-meta.ts`
- `src/lib/ingestion/parsers/turn-context.ts`
- `src/lib/ingestion/parsers/response-item.ts`
- `src/lib/ingestion/parsers/event-msg.ts`
- `src/lib/ingestion/log-parser.ts` + `src/lib/ingestion/parsers/tool-call.ts`
- `src/lib/db/schema.sql`
- `src/lib/metrics/overview.ts`, `src/lib/metrics/sessions.ts`, `src/lib/metrics/session-detail.ts`, `src/lib/metrics/tool-calls.ts`
- `src/components/sessions/*`, `src/app/page.tsx`, `src/app/models/page.tsx`, `src/app/tools/page.tsx`, `src/app/activity/page.tsx`
- `README.md` (data source claims)

## 3. Current Behavior Map

### Entry points

- Session ingestion: `ingestInternal()` reads `~/.codex/sessions/**.jsonl` and parses four line types (session_meta, turn_context, response_item, event_msg token_count). (`src/lib/ingestion/index.ts:107-207`)
- Log ingestion: same loop parses `~/.codex/log/codex-tui.log` for tool call events, correlated into tool_call records. (`src/lib/ingestion/index.ts:233-259`, `src/lib/ingestion/log-parser.ts:40-245`)

### State/data flow

- JSONL lines are parsed into three core tables: `session`, `message`, `model_call`. (`src/lib/ingestion/index.ts:158-211`, `src/lib/db/schema.sql:12-63`)
- Tool calls are parsed from log text and stored in `tool_call`. (`src/lib/ingestion/log-parser.ts:11-245`, `src/lib/db/schema.sql:65-89`)
- `turn_context` updates are used to set `context.model` and `context.modelProvider` for subsequent `event_msg` parsing but are not stored themselves. (`src/lib/ingestion/index.ts:165-205`, `src/lib/ingestion/parsers/turn-context.ts:16-58`)

### External dependencies

- Codex session JSONL: `~/.codex/sessions/**/rollout-*.jsonl` (per README).
- Codex TUI log: `~/.codex/log/codex-tui.log`.
- `history.jsonl` is watched but not ingested. (`src/lib/watcher/index.ts:82-107`, `src/lib/ingestion/file-discovery.ts:68-75`)

### Error handling/cancellation

- JSON parse errors are recorded per-file and do not stop ingestion. (`src/lib/ingestion/index.ts:150-156`)
- Missing log file is treated as non-fatal. (`src/lib/ingestion/index.ts:233-258`)

## 4. Key Findings (ranked)

1. **Project + git fields are already ingested but not surfaced as filters or rollups.**
   - Location(s): `src/lib/ingestion/parsers/session-meta.ts:38-78`, `src/lib/db/schema.sql:12-24`, `src/lib/metrics/sessions.ts:16-21, 63-67`.
   - Observation: `session` rows include `cwd`/`project`/`repo`-derived values plus `git_branch` and `git_commit`. UI only shows project name (derived from cwd) in the sessions table and git info in session detail.
   - Relevance: Enables project counts, repo/branch/worktree filters, and per-project rollups without adding new source data.

2. **Originator + CLI version are ingested but not shown anywhere.**
   - Location(s): `src/lib/ingestion/parsers/session-meta.ts:46-58`, `src/lib/metrics/sessions.ts:17-18`.
   - Observation: `originator` and `cli_version` are stored in `session` and returned by API types but not displayed.
   - Relevance: Supports multi-user or environment segmentation and version adoption tracking.

3. **Turn-level model context is parsed but never persisted.**
   - Location(s): `src/lib/ingestion/parsers/turn-context.ts:36-58`, `src/lib/ingestion/index.ts:165-205`.
   - Observation: Model/provider updates are used only as fallback for `event_msg` parsing.
   - Relevance: Enables model-switch timelines within a session and more accurate model attribution.

4. **Event messages carry cached and reasoning token fields not exposed in detail views.**
   - Location(s): `src/lib/ingestion/parsers/event-msg.ts:66-114`, `src/lib/metrics/session-detail.ts:196-228`.
   - Observation: `reasoning_tokens` and `cached_input_tokens` are stored in `model_call`, but session detail tables only show input/cached/output/duration (no reasoning/total).
   - Relevance: Supports reasoning-vs-output analysis, cache hit rate by project/branch/model, and cost attribution.

5. **Tool-call diagnostics include exit codes, stderr/stdout bytes, and errors but UI only shows status/duration.**
   - Location(s): `src/lib/ingestion/log-parser.ts:11-25`, `src/lib/db/schema.sql:65-82`, `src/app/tools/page.tsx:88-143`, `src/components/sessions/session-detail.tsx:110-170`.
   - Observation: The database stores error text and output size, but the UI table omits those fields.
   - Relevance: Enables failure triage, noisy tool detection, and reliability scoring by tool/command.

6. **tool_call_event table exists but ingestion never writes it.**
   - Location(s): `src/lib/db/schema.sql:91-109`, `src/lib/ingestion/log-parser.ts:145-245`.
   - Observation: Log parsing already has start/exit/failure events but only writes correlated `tool_call` rows.
   - Relevance: Enables detailed tool timelines, retries, and partial failures.

7. **History JSONL is watched but unused, despite README claim.**
   - Location(s): `README.md:14-16`, `src/lib/watcher/index.ts:82-107`, `src/lib/ingestion/file-discovery.ts:68-75`.
   - Observation: The watcher queues ingest when history.jsonl changes, but ingestion does not read it.
   - Relevance: Could provide first-prompt timestamps or session lifecycle anchors.

8. **Some metrics are computed but not displayed.**
   - Location(s): `src/lib/metrics/overview.ts:15-33, 165-206`, `src/app/page.tsx:26-96`.
   - Observation: `avgModelDurationMs` and `avgToolDurationMs` exist in the Overview API response but are not included in the KPI grid.
   - Relevance: Immediate low-effort insight into latency trends.

## 5. Expansion Spec (additive; existing behavior must remain identical)

### 5.1 Data model extensions

- Add a project dimension based on session metadata:
  - New table `project` with:
    - `id` TEXT PK (stable hash)
    - `name` TEXT (basename or `project`/`repo` field)
    - `root_path` TEXT NULL (optional; derived from cwd if available)
    - `git_remote` TEXT NULL (optional; from JSON if present, else null)
    - `first_seen_ts` INTEGER, `last_seen_ts` INTEGER
  - New table `project_ref` (or `worktree`) with:
    - `id` TEXT PK (hash of project + branch + cwd)
    - `project_id` TEXT FK
    - `branch` TEXT NULL
    - `commit` TEXT NULL
    - `cwd` TEXT NULL
    - `first_seen_ts` INTEGER, `last_seen_ts` INTEGER
  - Add optional columns to `session`: `project_id`, `project_ref_id` (or a `project_key` string) for fast filtering.

- Persist turn-level model context:
  - New table `session_context` with:
    - `id` TEXT PK (hash of session_id + ts + model/provider)
    - `session_id` TEXT FK
    - `ts` INTEGER
    - `model` TEXT NULL
    - `model_provider` TEXT NULL
    - `source_file`, `source_line` for traceability

- Store tool call events (optional but aligned with existing schema):
  - Populate `tool_call_event` with start/exit/failure events from log parsing.
  - `payload` JSON should include raw args text, parsed args, and detected command to support later diagnostics.

- Optional: event message capture for non-token_count event types:
  - New table `event_msg` or `event_msg_raw` with `type`, `ts`, `session_id`, `payload_json`.
  - Capture only when `payload.type` is not `token_count` (or via allowlist) to avoid bloat.

### 5.2 Ingestion and enrichment rules

- Project identification (uses existing JSON fields first):
  - If session_meta includes `project` or `repo`, use that as `project.name` and set `root_path = cwd`.
  - Else derive `project.name = basename(cwd)` and `root_path = cwd`.
  - `project_ref` key = hash of `{project_id, git_branch, cwd}` to support worktree differentiation.

- Branch/worktree support:
  - `git_branch` and `git_commit` already ingested from session_meta; map them into `project_ref`.
  - If multiple `cwd` values map to the same `project_id` + branch, treat them as distinct worktrees (worktree id includes cwd).

- Turn context persistence:
  - When parsing `turn_context`, insert/update `session_context` and update `session` with `model_provider` if missing.

- Tool events:
  - For each parsed start/exit/failure, emit a `tool_call_event` row with `correlation_key` and `payload` for later reconstruction.

- History JSONL (if enabled):
  - Parse `history.jsonl` only if schema can be confirmed; store `first_prompt_ts` for global/user/project rollups.

### 5.3 Derived metrics and insights

- Project rollups:
  - Sessions, model calls, tool calls, total tokens, cache hit rate, estimated cost, success rate.
  - Trend lines by project and by branch/worktree.

- Git branch/worktree analytics:
  - Active branches (by session count and token usage).
  - Branch age: first/last seen from session ts.
  - Hot worktrees: high token use or tool failures.

- Model usage quality:
  - Reasoning tokens ratio (reasoning / total) by model and by project.
  - Cached input ratio by model and by project.
  - Duration percentiles (p50, p90) per model and per project.

- Tool reliability and diagnostics:
  - Failure rate by tool and by command signature.
  - Top error messages and exit codes.
  - Large-output tools (stdout/stderr bytes) to identify noisy steps.

- Session composition:
  - Message role ratios (user vs assistant) when content is enabled.
  - Session timeline: sequence of model calls + tool calls + messages.

### 5.4 API changes

- New endpoints (or extend existing):
  - `GET /api/projects` -> list projects with rollups and filters.
  - `GET /api/projects/[id]` -> project detail with branch/worktree breakdown.
  - Extend `/api/sessions` filters: `project`, `branch`, `worktree`, `originator`, `cli_version`.
  - Extend `/api/tool-calls` filters: `exit_code`, `has_error`, `min_duration_ms`, `max_duration_ms`, `project`.
  - Add `/api/tool-events` for tool_call_event timelines (optional).

### 5.5 UI/UX additions

- Projects page:
  - Table with project name, sessions, tokens, cache hit rate, cost, tool success.
  - Filters for branch/worktree and time range.

- Session list filters:
  - Add project selector (grouped by repo) and branch/worktree selectors.
  - Add originator and CLI version filters.

- Session detail enhancements:
  - Show originator + CLI version.
  - Model context timeline (from session_context), showing model switches.
  - Tool call detail drawer: exit code, error, stdout/stderr bytes, correlation key.

- Tool analytics page:
  - Expand table columns for exit code and error snippet.
  - Add breakdown charts: failures by tool, average duration by tool, noisy tools by output size.

- Model details:
  - Add reasoning tokens column or toggle in model list.
  - Add cache hit rate trends by model.

### 5.6 Privacy and storage guardrails

- Keep `CODEX_OBSERV_STORE_CONTENT` gating for message content.
- If adding raw payload storage, store only allowlisted fields; redact tokens/secrets if present.
- Optional per-project opt-out if cwd matches exclude list.

## 6. Risks and Guardrails

- **Schema uncertainty for history.jsonl**: do not parse until format confirmed.
- **Storage bloat**: raw event payloads can grow fast; keep optional and truncated.
- **Performance**: project rollups should be pre-aggregated or indexed by `project_id` and `ts` to avoid slow joins.
- **Behavior compatibility**: existing KPI definitions must remain unchanged; new metrics are additive.

## 7. Open Questions / Assumptions

- What is the exact schema of `~/.codex/history.jsonl`? Does it include session IDs or just timestamps?
- Do session JSONL lines include other `event_msg` types worth capturing (errors, rate limits, tool results)?
- Is `project` or `repo` reliably present in session_meta, or should we rely on cwd basename only?
- Should git remote (GitHub repo) be derived from filesystem `.git` (non-JSON) or only from JSON metadata?

## 8. References (paths only)

- `src/lib/ingestion/index.ts`
- `src/lib/ingestion/file-discovery.ts`
- `src/lib/ingestion/jsonl-reader.ts`
- `src/lib/ingestion/parsers/session-meta.ts`
- `src/lib/ingestion/parsers/turn-context.ts`
- `src/lib/ingestion/parsers/response-item.ts`
- `src/lib/ingestion/parsers/event-msg.ts`
- `src/lib/ingestion/log-parser.ts`
- `src/lib/db/schema.sql`
- `src/lib/metrics/sessions.ts`
- `src/lib/metrics/overview.ts`
- `src/lib/metrics/session-detail.ts`
- `src/app/page.tsx`
- `src/components/sessions/sessions-table.tsx`
- `src/components/sessions/session-detail.tsx`
- `src/app/tools/page.tsx`
- `README.md`
