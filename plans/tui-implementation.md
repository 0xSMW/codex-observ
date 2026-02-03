# Plan
Using `plan` skill to outline a TUI implementation plan for Codex Observability.
Intent: deliver a local, keyboard-driven terminal UI that mirrors the core dashboards (Activity, Trends, Projects, Sessions, Tools, Models) using the existing SQLite/ingest pipeline and metrics logic.

**Requirements**
- Runs locally, no external network dependency, reads the same local data sources and SQLite DB as the web app.
- Keyboard-first navigation across the same primary sections as the web UI.
- Date range selection (presets + custom) and filtering for lists (projects, sessions, tool calls).
- Detail views for a project and a session with the most important KPIs and recent activity.
- Clear loading/error/empty states and a visible sync/refresh status.

**Scope**
- In: KPI tiles, tables, basic ASCII charts (sparklines/heatmap), pagination, search/filtering, and detail views.
- Out: Full visual parity with Recharts, data export, and multi-user features.

**Entry Points**
- `src/lib/metrics/overview.ts`
- `src/lib/metrics/activity.ts`
- `src/lib/metrics/projects.ts`
- `src/lib/metrics/sessions.ts`
- `src/lib/metrics/session-detail.ts`
- `src/lib/metrics/tool-calls.ts`
- `src/lib/metrics/models.ts`
- `src/lib/metrics/providers.ts`
- `src/lib/db/index.ts`
- `src/lib/db/schema.sql`
- `src/lib/ingestion/index.ts`
- `src/lib/metrics/ingest.ts`
- `src/lib/watcher/index.ts`
- `src/app/api/events/route.ts`
- `src/app/api/overview/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/sessions/route.ts`
- `src/lib/constants.ts`
- `src/app/projects/[id]/page.tsx`

**Data Changes**
- None expected for v1. If the TUI needs new aggregates (e.g., pre-binned heatmap data), add new helpers in `src/lib/metrics/*` and optionally new routes under `src/app/api/*` without changing `src/lib/db/schema.sql`.

**Action Items**
- [ ] Decide architecture: standalone TUI using `src/lib/metrics/*` and `src/lib/ingestion/*` vs HTTP client against `/api/*`.
- [ ] Pick a TUI framework (Ink vs blessed/neo-blessed) and build a layout/navigation spike with keyboard shortcuts and resize handling.
- [ ] Add a TUI entrypoint (e.g., `src/tui/index.ts`) plus a CLI script; wire config for `CODEX_HOME` and `CODEX_OBSERV_DB_PATH`.
- [ ] Build a data adapter with date range presets, pagination, caching, and refresh; optionally trigger ingest via `src/lib/metrics/ingest.ts` or `/api/ingest`.
- [ ] Implement screens for Trends, Activity, Projects list/detail, Sessions list/detail, Tools, and Models using ASCII charts and tables.
- [ ] Implement live updates (polling or SSE via `/api/events`) and surface sync/connection status.
- [ ] Document usage and keybindings and add a TUI smoke run description.

**Testing**
- Run ingest checks: `pnpm ingest:smoke` and `pnpm log:smoke`.
- Compare TUI totals vs API responses for the same range (e.g., `/api/overview`, `/api/projects`).
- Manual terminal QA: resize, large datasets, offline mode, pagination, filter correctness.

**Risks**
- SQLite lock contention if TUI and web server ingest concurrently; may need read-only access or retry/backoff.
- Terminal rendering performance on large tables; requires pagination and debounced refresh.
- ASCII chart fidelity may require simplified or alternative layouts.

**Open Questions**
- Should the TUI be standalone (no Next server) or require the web server to run?
- What is the minimum screen set for v1?
- Should the TUI allow triggering ingest/sync or remain read-only?
