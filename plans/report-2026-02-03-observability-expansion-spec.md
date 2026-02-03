# Observability Expansion Spec & Findings

## Executive Summary
Observability data is ingested from JSONL session files under the Codex home directory and from the CLI log, then normalized into session, message, model_call, tool_call, and related tables. The JSONL source stream carries session metadata (cwd, originator, CLI version, model provider, git branch/commit), turn-level model context, messages, and token-usage events with per-call durations and reasoning tokens, while the log parser captures tool call commands, exit status, durations, and I/O sizes. Many of these fields are stored but only partially surfaced in the UI: sessions list and tools list expose only a subset of available columns; advanced filters supported by the API are missing from the UI; and some data sets (session_context, tool_call_event) are not surfaced at all. There are also cross-screen inconsistencies in filtering controls and date-range usage; Projects sorting is wired in the UI but ignored by the API. This report maps current behavior and provides a detailed, non-implementation spec to expand the product by exposing existing data, aligning filters, and adding consistent observability views. Behavior must remain identical in ingestion and existing metrics calculations.

## Scope Reviewed
- src/lib/ingestion/index.ts
- src/lib/ingestion/file-discovery.ts
- src/lib/ingestion/jsonl-reader.ts
- src/lib/ingestion/parsers/helpers.ts
- src/lib/ingestion/parsers/session-meta.ts
- src/lib/ingestion/parsers/turn-context.ts
- src/lib/ingestion/parsers/response-item.ts
- src/lib/ingestion/parsers/event-msg.ts
- src/lib/ingestion/log-parser.ts
- src/lib/ingestion/parsers/tool-call.ts
- src/lib/db/schema.sql
- src/lib/db/queries/session-context.ts
- src/lib/db/queries/tool-call-events.ts
- src/lib/metrics/overview.ts
- src/lib/metrics/sessions.ts
- src/lib/metrics/session-detail.ts
- src/lib/metrics/tool-calls.ts
- src/lib/metrics/projects.ts
- src/lib/metrics/models.ts
- src/lib/metrics/providers.ts
- src/app/api/sessions/route.ts
- src/app/api/tool-calls/route.ts
- src/app/api/projects/route.ts
- src/app/api/models/route.ts
- src/app/api/providers/route.ts
- src/app/sessions/page.tsx
- src/components/sessions/session-filters.tsx
- src/components/sessions/sessions-table.tsx
- src/components/sessions/session-detail.tsx
- src/app/tools/page.tsx
- src/app/projects/page.tsx
- src/app/projects/columns.tsx
- src/app/projects/[id]/page.tsx
- src/app/models/page.tsx
- src/app/trends/page.tsx
- src/app/activity/page.tsx
- src/components/layout/header.tsx
- src/hooks/use-sessions.ts
- src/hooks/use-tool-calls.ts
- src/hooks/use-projects.ts
- src/hooks/use-models.ts
- src/hooks/use-providers.ts
- src/hooks/use-sessions-medians.ts

## Current Behavior Map
### Entry points
- Ingest entry points are `ingestAll` and `ingestIncremental`, which call `ingestInternal` to discover JSONL session files and parse them into DB records, then parse the CLI log for tool calls. Locations: src/lib/ingestion/index.ts:112-334.
- JSONL discovery walks `~/.codex/sessions` and filters `.jsonl` files. Locations: src/lib/ingestion/file-discovery.ts:20-67.
- The CLI log `~/.codex/log/codex-tui.log` is parsed into tool calls and tool-call events. Locations: src/lib/ingestion/index.ts:273-303 and src/lib/ingestion/log-parser.ts:55-305.
- UI screens pull data via Next.js API routes for overview, sessions, tools, projects, models, providers, activity, and session detail. Locations: src/app/api/*.ts and src/app/*/page.tsx.

### State/data flow
- JSONL lines are parsed incrementally into JSON objects (line-numbered, error tracked) and routed by `type`/`kind`/`event_type`/`eventType` to parsers for session meta, turn context, response items, and token usage. Locations: src/lib/ingestion/jsonl-reader.ts:66-142 and src/lib/ingestion/parsers/helpers.ts:24-30.
- Parsed records are inserted into `session`, `message`, `model_call`, and `session_context` tables; log parsing inserts into `tool_call` and `tool_call_event`. Locations: src/lib/ingestion/index.ts:163-295 and src/lib/db/schema.sql:37-155.
- Metrics modules query the DB and aggregate data for dashboards and tables. Locations: src/lib/metrics/*.ts.
- Hooks build query params and call API routes, which pass filters and pagination into metrics modules. Locations: src/hooks/use-*.ts and src/app/api/*.ts.

### External dependencies
- Filesystem sources: `~/.codex/sessions/**/*.jsonl`, `~/.codex/log/codex-tui.log`, and a watcher that treats `history.jsonl` as relevant. Locations: src/lib/ingestion/file-discovery.ts:52-75 and src/lib/watcher/index.ts:91-98.
- Pricing data for cost estimates is fetched or read for model usage. Locations: src/lib/metrics/overview.ts:1-305 and src/lib/metrics/models.ts:1-169.

### Error handling/cancellation
- JSON parse errors are captured with line numbers and truncated raw content. Locations: src/lib/ingestion/jsonl-reader.ts:117-126.
- File stat/read errors are captured per file with synthetic line numbers. Locations: src/lib/ingestion/index.ts:129-152.
- UI error handling varies by screen; most pages show `ErrorState` when `error && !data`, otherwise inline empty rows or cards. Locations: src/app/*/page.tsx and src/components/*.

## Key Findings (ranked)
1. **Primary ingest sources are JSONL session files and the CLI log; `history.jsonl` is considered relevant by the watcher but not ingested by `ingestInternal`.**
   - Location(s): src/lib/ingestion/file-discovery.ts:52-75, src/lib/ingestion/index.ts:112-245, src/lib/watcher/index.ts:91-98.
   - Observation: Session JSONL files under `~/.codex/sessions` are the only JSON sources enumerated by the ingest pipeline; the watcher flags `history.jsonl`, but there is no discovery or parse path for it in `ingestInternal`.
   - Relevance to Y: Defines the actual JSON sources available for observability and highlights a possible data source not surfaced.

2. **Session metadata provides originator, CLI version, model provider, and git info, but sessions list and filters expose only a subset.**
   - Location(s): src/lib/ingestion/parsers/session-meta.ts:38-107, src/lib/metrics/sessions.ts:55-105, src/components/sessions/session-filters.tsx:12-79, src/components/sessions/sessions-table.tsx:33-71, src/components/sessions/session-detail.tsx:55-71.
   - Observation: The session record includes originator, cli_version, model_provider, git_branch, git_commit, and cwd. The sessions list UI shows workspace + provider and filters only on search/model/provider/project; originator/cliVersion/branch/worktree filters are supported by the API but not exposed.
   - Relevance to Y: These fields enable attribution and release-impact insights that are currently not surfaced in list views or filters.

3. **Turn-level model/provider context is stored in `session_context` but not used by metrics or UI.**
   - Location(s): src/lib/ingestion/parsers/turn-context.ts:16-58, src/lib/ingestion/index.ts:211-231, src/lib/db/queries/session-context.ts:16-26, src/lib/db/schema.sql:142-151.
   - Observation: Each turn can emit model/provider context updates that are persisted to `session_context`, but current metrics modules query `session`, `model_call`, `message`, and `tool_call` instead.
   - Relevance to Y: Model switching or fallback behavior can be derived from existing data but is not currently surfaced.

4. **Tool-call ingestion captures rich execution details, yet the UI surfaces only command/exit/status/duration/error and lacks advanced filters.**
   - Location(s): src/lib/ingestion/log-parser.ts:11-45, src/lib/ingestion/parsers/tool-call.ts:28-82, src/lib/db/schema.sql:96-134, src/app/api/tool-calls/route.ts:26-48, src/app/tools/page.tsx:157-209.
   - Observation: The DB stores stdout/stderr byte counts, correlation keys, and per-event payloads. The tools UI shows a minimal subset and offers only a command search, despite API support for status, tool name, exit codes, error presence, and duration filters.
   - Relevance to Y: Existing data supports deeper diagnostics (I/O size, error clustering, slow calls) that are not surfaced.

5. **Projects sorting is wired in the UI and hook, but the API route ignores `sortBy`/`sortOrder`.**
   - Location(s): src/app/projects/page.tsx:27-55, src/hooks/use-projects.ts:22-32, src/app/api/projects/route.ts:22-33, src/lib/metrics/projects.ts:18-27,238-239.
   - Observation: The UI passes sort parameters and shows sort icons, yet the API route does not parse or pass them into `getProjectsList`.
   - Relevance to Y: Sorting appears available but is ineffective, an inconsistency that impacts data exploration.

6. **Date-range usage is inconsistent across screens; Models/Providers ignore the global range picker.**
   - Location(s): src/components/layout/header.tsx:40-42, src/hooks/use-models.ts:7-13, src/hooks/use-providers.ts:7-13, src/app/api/models/route.ts:9-27, src/app/api/providers/route.ts:9-21.
   - Observation: The header hides the range picker on `/models`, and those hooks call APIs without date params; APIs use `getDateRange` (not `resolveRange`), which means no default range is applied when params are absent.
   - Relevance to Y: Cross-screen metrics are not comparable because some screens are unbounded while others are range-filtered.

7. **Session medians API returns a time series, but the UI uses only the summary tiles.**
   - Location(s): src/app/api/sessions/medians/route.ts:14-16, src/hooks/use-sessions-medians.ts:10-24, src/app/sessions/page.tsx:80-83.
   - Observation: The medians endpoint returns `series` and `summary`, but the Sessions page renders only the summary tiles and does not visualize the series.
   - Relevance to Y: Existing insights (median calls/tokens/cost/duration by day) are not surfaced.

## Candidate Change Points (not an implementation plan)
Behavior must remain identical.

1. **Spec: Surface session metadata and add advanced session filters**
   - Data sources: `session` fields from JSONL session_meta (originator, cli_version, git_branch, git_commit, cwd). Locations: src/lib/ingestion/parsers/session-meta.ts:38-107 and src/lib/metrics/sessions.ts:55-105.
   - UI surfaces:
     - Sessions list columns for originator, CLI version, and git branch (shortened) alongside existing columns.
     - Session list filter controls for originator, CLI version, branch, and worktree (project_ref).
     - Project detail “Branches & Worktrees” to link into Sessions filtered by branch/worktree.
   - Functional requirements:
     - Filters must map to existing API params (`originator`, `cliVersion`, `branch`, `worktree`). Locations: src/app/api/sessions/route.ts:21-29.
     - Search remains supported for cwd/branch/originator as today.
   - Success criteria:
     - Filters reduce sessions list consistently with API response filters.
     - New columns render values when present and show `—` when absent.

2. **Spec: Surface model and token detail using existing model_call and session_context data**
   - Data sources: `model_call` token fields and duration; `session_context` for model/provider changes. Locations: src/lib/ingestion/parsers/event-msg.ts:41-139 and src/lib/db/schema.sql:75-90,142-151.
   - UI surfaces:
     - Session detail model calls table adds reasoning tokens and total tokens columns.
     - A “Model switches” panel that lists context change events with timestamp, model, and provider.
     - Optional trend widget for reasoning-token share in Trends or Models pages.
   - Functional requirements:
     - Use `session_context` to order changes by timestamp and deduplicate by `dedup_key`.
     - Reasoning tokens should be displayed as `—` when zero.
   - Success criteria:
     - Session detail exposes model switches when present.
     - Reasoning tokens are visible in model call lists and aggregate views.

3. **Spec: Expand tool-call diagnostics and filtering**
   - Data sources: `tool_call` fields (stdout_bytes, stderr_bytes, correlation_key) and `tool_call_event` payloads. Locations: src/lib/db/schema.sql:96-134 and src/lib/db/queries/tool-call-events.ts:21-44.
   - UI surfaces:
     - Tools page filter controls for status, tool name, exit code, duration range, and error presence.
     - Tool calls table shows stdout/stderr byte counts and links to session (when `sessionId` exists).
     - Optional “Tool call timeline” drawer using `tool_call_event` start/end payloads for a selected call.
   - Functional requirements:
     - Filters map directly to existing API params. Locations: src/app/api/tool-calls/route.ts:26-48.
     - Maintain existing pagination and command search semantics.
   - Success criteria:
     - Filters visibly affect tool-call list and summary metrics.
     - Diagnostics fields render when present, fall back to `—` when null.

4. **Spec: Align date-range behavior and projects sorting across screens**
   - Data sources: existing range params and project sort support. Locations: src/lib/metrics/projects.ts:18-27,238-239 and src/app/api/projects/route.ts:22-33.
   - UI surfaces:
     - Enable DateRangePicker on `/models` and ensure `useModels`/`useProviders` pass `startDate`/`endDate`.
     - Projects sorting should be honored by the API so column sort state matches results.
   - Functional requirements:
     - Models/Providers APIs should use `resolveRange` or explicitly apply the date range received from the UI.
     - Projects API must parse and forward sort parameters to `getProjectsList`.
   - Success criteria:
     - Models/Providers reflect the same date range as Trends/Sessions/Tools.
     - Projects sorting is consistent between UI indicators and server result ordering.

5. **Spec: Add an Ingest Status view for transparency**
   - Data sources: ingest state and status APIs. Locations: src/lib/metrics/ingest.ts:63-121 and src/app/api/ingest/route.ts:4-32.
   - UI surfaces:
     - A lightweight “Ingest” screen or drawer listing recently ingested files, last updated timestamps, and parse error counts.
     - Surface last ingest run duration and error count from `lastResult`.
   - Functional requirements:
     - Read-only display; ingestion behavior and scheduling remain unchanged.
   - Success criteria:
     - Users can see whether data is current and whether errors occurred during ingest.

## Risks and Guardrails
- Message content storage is gated by `CODEX_OBSERV_STORE_CONTENT`; UI must handle `null` content gracefully. Locations: src/lib/ingestion/parsers/response-item.ts:97-109.
- Tool-call timestamps may differ in timezone (log parser notes local vs UTC), so timeline windows should remain conservative. Locations: src/lib/metrics/session-detail.ts:189-205.
- Project grouping logic merges worktrees by canonical name and git remote; changes must preserve this behavior. Locations: src/lib/metrics/projects.ts:8-16,452-478.

## Open Questions/Assumptions
- Is `history.jsonl` intended to be ingested? The watcher treats it as relevant, but `ingestInternal` does not load it.
- Are originator/CLI-version filters desired in the primary Sessions UX, or should they be secondary/advanced filters?
- Should Models/Providers be range-filtered to match the rest of the dashboard, or intentionally global?
- Should message content ever be displayed when `CODEX_OBSERV_STORE_CONTENT` is disabled, or should the UI signal that content storage is off?

## References (paths only)
- src/lib/ingestion/index.ts
- src/lib/ingestion/file-discovery.ts
- src/lib/ingestion/jsonl-reader.ts
- src/lib/ingestion/parsers/helpers.ts
- src/lib/ingestion/parsers/session-meta.ts
- src/lib/ingestion/parsers/turn-context.ts
- src/lib/ingestion/parsers/response-item.ts
- src/lib/ingestion/parsers/event-msg.ts
- src/lib/ingestion/log-parser.ts
- src/lib/ingestion/parsers/tool-call.ts
- src/lib/db/schema.sql
- src/lib/db/queries/session-context.ts
- src/lib/db/queries/tool-call-events.ts
- src/lib/metrics/overview.ts
- src/lib/metrics/sessions.ts
- src/lib/metrics/session-detail.ts
- src/lib/metrics/tool-calls.ts
- src/lib/metrics/projects.ts
- src/lib/metrics/models.ts
- src/lib/metrics/providers.ts
- src/app/api/sessions/route.ts
- src/app/api/tool-calls/route.ts
- src/app/api/projects/route.ts
- src/app/api/models/route.ts
- src/app/api/providers/route.ts
- src/app/sessions/page.tsx
- src/components/sessions/session-filters.tsx
- src/components/sessions/sessions-table.tsx
- src/components/sessions/session-detail.tsx
- src/app/tools/page.tsx
- src/app/projects/page.tsx
- src/app/projects/columns.tsx
- src/app/projects/[id]/page.tsx
- src/app/models/page.tsx
- src/app/trends/page.tsx
- src/app/activity/page.tsx
- src/components/layout/header.tsx
- src/hooks/use-sessions.ts
- src/hooks/use-tool-calls.ts
- src/hooks/use-projects.ts
- src/hooks/use-models.ts
- src/hooks/use-providers.ts
- src/hooks/use-sessions-medians.ts
