# Codex.app Capabilities & Reporting Opportunities (2026-02-03)

**Executive Summary**
I inspected the local `/Applications/Codex.app` bundle and found an Electron app with a main process (`.vite/build/main.js`), a preload bridge, a renderer bundle (`webview/assets/index-*.js`), and a worker bundle (`.vite/build/worker.js`). The app integrates Sentry and Datadog logging, including a file-based log rotation system tied to a `codex_app_session_id`, which suggests it generates rich app-level telemetry distinct from CLI logs. The worker implements extensive git and worktree operations (create/delete worktrees, branch status, apply changes, commit) and emits worker events, while the renderer calls into these via worker RPC. The renderer also emits product events like `codex_app_window_opened` / `codex_app_window_closed`, indicating explicit app-session analytics. Dependencies indicate a local SQLite store (`better-sqlite3`), terminal integration (`node-pty`), and TOML config parsing (`smol-toml`), pointing to local state and config surfaces beyond the CLI. In this repo, existing observability focuses on CLI log ingestion into SQLite tables for sessions, messages, model calls, tool calls, and tool call events, plus derived KPIs (token totals, success rate, durations, costs) and activity series. Based on the desktop app capabilities, the largest reporting gaps are app-session telemetry, automation run lifecycle, worktree lifecycle/usage, and desktop error/log aggregation. The candidate change points below outline where such reporting could be added without altering existing behavior.

**Scope Reviewed**
Codex.app bundle (local): `/tmp/codex-package.json`, `/tmp/codex-preload.js`, `/tmp/codex-main.js`, `/tmp/codex-worker.js`, `/tmp/codex-webview-index.html`, `/tmp/codex-webview-index.js`.

codex-observ codebase: `src/lib/db/schema.sql`, `src/lib/db/queries/tool-call-events.ts`, `src/lib/ingestion/log-parser.ts`, `src/lib/ingestion/parsers/event-msg.ts`, `src/lib/metrics/overview.ts`, `src/lib/metrics/activity.ts`, `src/lib/metrics/tool-calls.ts`, `src/lib/metrics/ingest.ts`, `src/lib/watcher/index.ts`.

**Current Behavior Map**
Codex.app entry points: The Electron main entry is `.vite/build/main.js` (package.json `main`), with a preload bridge exposing IPC helpers and worker messaging to the renderer. The renderer loads from `webview/index.html` and `webview/assets/index-*.js`, and the worker bundle handles background tasks and telemetry. Locations: `/tmp/codex-package.json:6`, `/tmp/codex-preload.js:1`, `/tmp/codex-webview-index.html:7`, `/tmp/codex-worker.js:303`.

Codex.app state/data flow: Renderer → preload bridge IPC → main process or worker. The renderer invokes worker RPC for git/worktree operations and automation cleanup, while the worker processes requests and emits events. Locations: `/tmp/codex-preload.js:1`, `/tmp/codex-webview-index.js:2889`, `/tmp/codex-worker.js:274`.

Codex.app external dependencies: Sentry (`@sentry/electron`, `@sentry/node`), Datadog log sink in worker, local SQLite (`better-sqlite3`), terminal/PTY (`node-pty`), and TOML parsing (`smol-toml`). Locations: `/tmp/codex-package.json:59-77`, `/tmp/codex-worker.js:303`.

Codex.app error handling/cancellation: The worker initializes Sentry, tags session IDs, logs via a file-based logger, and handles worker request cancellation. Locations: `/tmp/codex-worker.js:303`.

codex-observ entry points: A file watcher enqueues ingestion for `.jsonl` logs and `codex-tui.log`, then runs ingestion and publishes ingest/metrics events. Locations: `src/lib/watcher/index.ts:91-191`.

codex-observ state/data flow: Ingested logs are parsed into sessions, messages, model calls, tool calls, and tool call events stored in SQLite tables; metrics modules query these tables to produce KPIs and activity series. Locations: `src/lib/db/schema.sql:37-140`, `src/lib/ingestion/log-parser.ts:55-205`, `src/lib/ingestion/parsers/event-msg.ts:41-139`, `src/lib/metrics/overview.ts:26-155`, `src/lib/metrics/activity.ts:48-179`, `src/lib/metrics/tool-calls.ts:155-199`.

codex-observ error handling/cancellation: Watcher publishes error events and captures ingest errors; ingest status tracks running/idle state. Locations: `src/lib/watcher/index.ts:70-187`, `src/lib/metrics/ingest.ts:124-160`.

**Key Findings (Ranked)**

1. Desktop app telemetry and log pipeline are richer than CLI logs.
   Location(s) with line numbers: `/tmp/codex-package.json:59-77`, `/tmp/codex-worker.js:303`, `/tmp/codex-main.js:525`, `/tmp/codex-preload.js:1`.
   Observation: The desktop app initializes Sentry and Datadog log sink, tags a `codex_app_session_id`, and writes to a file-based logger with log rotation. Preload exposes Sentry init options to the renderer. This implies app-level telemetry and diagnostics beyond CLI output.
   Relevance to Y: These signals are not represented in codex-observ today, suggesting a new reporting category for desktop app stability and usage.

2. The desktop app operates a full git/worktree management layer via worker RPC.
   Location(s) with line numbers: `/tmp/codex-worker.js:274`, `/tmp/codex-webview-index.js:2889`.
   Observation: The worker supports git status, branch metadata, worktree create/delete, apply patch, and commit flows; the renderer subscribes to worktree events and triggers cleanup.
   Relevance to Y: Worktree lifecycle and git activity are high-value reporting candidates not currently captured by codex-observ.

3. Renderer emits explicit product events for app-session lifecycle.
   Location(s) with line numbers: `/tmp/codex-webview-index.js:2889`.
   Observation: `codex_app_window_opened` and `codex_app_window_closed` events are emitted, and the renderer includes telemetry and message-bus handlers.
   Relevance to Y: App-session counts and window lifecycle metrics could become a new reporting stream aligned with desktop usage.

4. Deep links expose distinct UX surfaces (settings, skills, automations, threads).
   Location(s) with line numbers: `/tmp/codex-main.js:525`.
   Observation: The main process parses `codex://` deep links and routes to settings, skills, automations, and threads.
   Relevance to Y: These UX surfaces could be mapped to reporting segments (e.g., automation usage or skills usage) if event streams are available.

5. The desktop app embeds local persistence and terminal integration.
   Location(s) with line numbers: `/tmp/codex-package.json:63-76`.
   Observation: Dependencies include `better-sqlite3`, `node-pty`, and `smol-toml`, indicating local DB state, terminal sessions, and TOML-based config.
   Relevance to Y: These components imply additional local data sources that could inform reporting (e.g., terminal tool usage, config-driven behavior).

6. codex-observ already provides robust CLI-derived KPIs and tool-call analytics.
   Location(s) with line numbers: `src/lib/db/schema.sql:37-140`, `src/lib/metrics/overview.ts:26-155`, `src/lib/metrics/activity.ts:48-179`, `src/lib/metrics/tool-calls.ts:155-199`, `src/lib/db/queries/tool-call-events.ts:3-44`.
   Observation: The current system ingests CLI logs into session/message/model_call/tool_call/tool_call_event tables and computes KPIs (token totals, tool success rate, duration averages, cost estimates) plus activity series.
   Relevance to Y: New reporting should complement, not duplicate, these existing analytics.

**Candidate Change Points (behavior must remain identical)**

1. Add a desktop-app telemetry ingestion path to capture app-session events (window opened/closed, view focus) as a new event stream, parallel to existing model/tool events. Candidate change areas: `src/lib/ingestion` (new parser), `src/lib/db/schema.sql` (new table or extend event types), `src/lib/metrics` (new KPI series), and `src/app` for a UI surface.

2. Add automation lifecycle reporting (runs queued/completed/archived) based on desktop app automation signals. Candidate change areas: `src/lib/ingestion` (new parser for automation run signals), `src/lib/metrics` (automation summaries), and a new dashboard section.

3. Add worktree lifecycle and git activity reporting (worktree created/deleted, branch changes, diff stats, apply patch outcomes). Candidate change areas: `src/lib/db/schema.sql` for worktree/git tables, `src/lib/metrics` for summaries, and `src/app` for visualization.

4. Add desktop error/log aggregation by ingesting Codex.app log files (if accessible) to report crash rates and error categories. Candidate change areas: `src/lib/watcher/index.ts` (watch additional log paths), `src/lib/ingestion` (log parser), `src/lib/metrics` (error KPIs).

**Risks and Guardrails**
The Codex.app bundles are minified with no source maps, so some capabilities may be present but not observable via static inspection. The app’s runtime services (app server, telemetry endpoints, log formats) were not reachable from this analysis, so event schemas are inferred. Any new reporting should avoid capturing sensitive content from local logs or terminal output; consider strict redaction and opt-in controls if implemented.

**Open Questions / Assumptions**
Are Codex.app log files (e.g., `~/Library/Logs/com.openai.codex`) available and stable enough for ingestion? What is the on-disk schema for any local SQLite store used by the app? Are automation run events or worktree events emitted into logs that codex-observ can parse? Is it acceptable to ingest desktop telemetry events locally, or should reporting remain CLI-only?

**References**
/tmp/codex-package.json
/tmp/codex-preload.js
/tmp/codex-main.js
/tmp/codex-worker.js
/tmp/codex-webview-index.html
/tmp/codex-webview-index.js
src/lib/db/schema.sql
src/lib/db/queries/tool-call-events.ts
src/lib/ingestion/log-parser.ts
src/lib/ingestion/parsers/event-msg.ts
src/lib/metrics/overview.ts
src/lib/metrics/activity.ts
src/lib/metrics/tool-calls.ts
src/lib/metrics/ingest.ts
src/lib/watcher/index.ts

---

**Addendum A: Codex.app Log Formats And Parser Spec**

Observed on-disk locations (macOS).

- Base path: `~/Library/Logs/com.openai.codex/`.
- Date partitioning: `YYYY/MM/DD/` subfolders under the base path.
- Example files observed on 2026-02-03: `~/Library/Logs/com.openai.codex/2026/02/03/codex-desktop-c8b6c17b-21a3-4d40-b7db-2da0e9bbe9ed-2049-t0-i1-013627-0.log` and `~/Library/Logs/com.openai.codex/2026/02/03/codex-desktop-c8b6c17b-21a3-4d40-b7db-2da0e9bbe9ed-2049-t1-i1-013629-0.log`.

Filename pattern (inferred from file names and bundle code).

- Pattern: `codex-desktop-<app_session_id>-<process_id>-t<thread_id>-i<instance_id>-<HHMMSS>-<segment>.log`.
- Example: `codex-desktop-c8b6c17b-21a3-4d40-b7db-2da0e9bbe9ed-2049-t0-i1-013627-0.log`.
- Field: `app_session_id` is a UUID-like string.
- Field: `process_id` is the OS PID.
- Field: `thread_id` appears as `t0`, `t1` and likely maps to main vs worker threads.
- Field: `instance_id` is `i1` here and likely increments per logger instance.
- Field: `HHMMSS` appears to be UTC time when the log file segment started.
- Field: `segment` is a numeric rolling index.

Record format (observed).

- Each record begins with an ISO-8601 UTC timestamp with millisecond precision and `Z` suffix.
- Format: `<timestamp> <level> [<component>] <message>` where `[<component>]` is optional.
- Example: `2026-02-03T01:36:27.383Z info Launching app {`.
- Example: `2026-02-03T01:36:27.598Z info [sparkle] Sparkle init begin { platform: 'darwin', packaged: true }`.
- Example with multiline continuation: `2026-02-03T02:53:08.532Z warning [git] [4ffb2bb9] encountered an error running git command code=128 stderr=fatal: --worktree cannot be used with multiple working trees unless the config` followed by a non-timestamp continuation line.
- Continuation lines do not begin with an ISO timestamp and are part of the prior record’s message.
- Structured objects are printed via Node’s formatter and are not strict JSON. Example values use single quotes and `undefined` may appear.

Proposed parser spec (ingestion).

- File discovery: enumerate `~/Library/Logs/com.openai.codex/YYYY/MM/DD/*.log` and parse filename tokens into metadata fields.
- Record delimiting: a new record starts when a line matches `^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z\\s`; non-matching lines are appended as literal `\\n` continuations.
- Record parsing: extract `timestamp`, `level`, optional `component` in the first bracket token, and `message` as the remainder. If a trailing object block is detected, capture it as `payload_text` but do not JSON-parse it.
- Normalization and dedup: `dedup_key = hash(file_path + line_number + timestamp + level + message)` and `event_id = dedup_key`.
- Storage proposal: create `desktop_log_event` with columns `id`, `app_session_id`, `ts`, `level`, `component`, `message`, `payload_text`, `process_id`, `thread_id`, `instance_id`, `segment_index`, `file_path`, `line_number`, `created_at`.
- Redaction guardrails: redact path prefixes, email-like strings, and workspace-specific identifiers from `message` and `payload_text` at ingest time.

Concrete log types visible in the sample logs (useful for downstream metrics).

- App lifecycle: `Launching app { ... }`, Sparkle update initialization, CLI connection initialized.
- Git activity: `[git] encountered an error running git command` and `[git-repo-watcher] Starting git repo watcher for <path>`.
- Skills and app server: `[electron-message-handler] Skills/list request` and `Received app server result: <uuid> object(keys=<n>)`.
- Notifications: `[desktop-notifications] service starting`.

---

**Addendum B: Metrics Schema And UI Outline For Worktree/Automation Reporting**

Metrics schema proposal (SQLite).

- New table: `desktop_log_event` as described in Addendum A.
- New table: `worktree_event` with columns `id`, `ts`, `action`, `worktree_path`, `repo_root`, `branch`, `status`, `error`, `app_session_id`, `source_log_id`, `dedup_key`.
- New table: `automation_event` with columns `id`, `ts`, `action`, `thread_id`, `status`, `error`, `app_session_id`, `source_log_id`, `dedup_key`.
- New table: `worktree_daily` with columns `date`, `created_count`, `deleted_count`, `error_count`, `active_count`, `avg_create_duration_ms`.
- New table: `automation_daily` with columns `date`, `runs_queued`, `runs_completed`, `runs_failed`, `avg_duration_ms`, `backlog_peak`.

Metrics API outline.

- `GET /api/worktrees` returning KPI summary and daily series for created, deleted, errors, active, and avg create duration.
- `GET /api/automations` returning KPI summary and daily series for queued, completed, failed, avg duration, and backlog peak.
- `GET /api/worktrees/events` and `GET /api/automations/events` returning recent event rows for tables.

UI outline.

- New top-level nav item: `Worktrees` and `Automations`
- Worktrees page layout: row of `KpiCard` components, `ChartCard` for created vs deleted, `ChartCard` for active worktrees, and a recent events table with filters.
- Automations page layout: row of `KpiCard` components, `ChartCard` for queued/completed/failed, and a recent events table with filters.
- Shared UX patterns: use existing shared components (`ChartCard`, `KpiCard`, `ErrorState`, loading skeletons), `space-y-6` layout spacing, and explicit loading and error states.

Data derivation notes.

- `active_count` can be computed as a running total of `created - deleted` per day, floored at 0.
- Failure rate is `failed / (completed + failed)` for automations, and `error_count / created` for worktrees.
- Backlog peak is the maximum of `queued - completed` within the period.

Guardrails.

- Do not ingest log lines that include user prompt content or terminal output. Restrict to app lifecycle and worktree/automation operational logs.
- If log coverage is insufficient for automations, gate UI behind a feature flag until event extraction is validated.
