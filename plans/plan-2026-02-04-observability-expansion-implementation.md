# Implementation Plan: Observability Expansion

## Goals

- Surface existing observability fields already stored in the DB (session metadata, token details, tool I/O stats) without changing ingest behavior.
- Align filters, sorting, and date-range behavior across screens so UI controls match API capabilities.
- Add an ingest transparency view that uses existing ingest APIs.

## Non-Goals

- No changes to ingest/parsing logic or DB schema.
- No changes to pricing logic or token accounting.
- No long-term analytics or retention features.

## Milestones & Tasks

### 0) Baseline Alignment & Guardrails

1. Confirm product decisions on open questions from the spec.
2. Define UX placement for new filters (Sessions/Tools) and new panels (Model switches, Ingest status).
3. Confirm whether `history.jsonl` is in-scope. If not, explicitly mark out of scope.

### 1) API & Hook Parity Fixes

1. Projects sorting parity

- Update `src/app/api/projects/route.ts` to parse `sortBy` and `sortOrder` and pass them to `getProjectsList`.
- Ensure `use-projects` still sends sort params and pagination remains server-driven.
- Acceptance: sorting in `ProjectsDataTable` changes server results and total ordering.

2. Models/Providers range parity

- Decide whether `/models` should show date range picker.
- Update `src/components/layout/header.tsx` to show `DateRangePicker` for `/models` if range filtering is desired.
- Update `src/hooks/use-models.ts` and `src/hooks/use-providers.ts` to accept range and pass `startDate`/`endDate`.
- Update `src/app/api/models/route.ts` and `src/app/api/providers/route.ts` to use `resolveRange` or accept incoming range params explicitly.
- Acceptance: models/providers match the same range as Trends/Sessions/Tools.

### 2) Sessions: Advanced Filters + Metadata Columns

1. Extend Sessions filter UI

- Add controls for `originator`, `cliVersion`, `branch`, and `worktree`.
- Reuse the existing filter card layout in `src/components/sessions/session-filters.tsx`.
- Update filter value type and state in `src/app/sessions/page.tsx`.
- Wire params in `src/hooks/use-sessions.ts` to existing API filters.

2. Sessions table columns

- Add columns for originator, CLI version, and git branch in `src/components/sessions/sessions-table.tsx`.
- Keep `—` fallback for empty values.

3. Session detail enhancements

- Add reasoning tokens and total tokens columns in `Model calls` table (`src/components/sessions/session-detail.tsx`).
- Add a “Model switches” panel using `session_context` data. Requires API support in session detail response.

4. API/data updates for session detail

- Extend `src/lib/metrics/session-detail.ts` to query `session_context` events for a session and include them in `SessionDetailResponse`.
- Update `src/app/api/sessions/[id]/route.ts` and `src/types/api.ts` to include the new payload.

Acceptance:

- New filters reduce sessions list using existing API params.
- Session list shows metadata columns with proper fallbacks.
- Session detail displays reasoning/total tokens and a model switch timeline when data exists.

### 3) Tools: Advanced Filters + Diagnostics

1. Tools filters

- Add filter controls for status, tool name, exit code, duration range, and error presence.
- Implement query param wiring in `src/hooks/use-tool-calls.ts` and in `src/app/tools/page.tsx`.
- Keep command search intact.

2. Tools table diagnostics

- Add stdout/stderr byte counts and session link (if `sessionId` exists) to the tools table.
- Display `—` for null values.

3. Optional tool call timeline

- Add a lightweight drawer or detail panel for a selected call showing start/end payloads from `tool_call_event`.
- Requires API endpoint or extension to existing tool calls API to fetch event details.

Acceptance:

- Tools filters match API capabilities and visibly affect list + KPIs.
- Diagnostic columns appear and handle missing data gracefully.

### 4) Session Medians Series Visualization

1. Add chart for median calls/tokens/cost/duration over time.

- Reuse shared chart components and `ChartCard` styles.
- Use `src/hooks/use-sessions-medians.ts` series data in `src/app/sessions/page.tsx`.

Acceptance:

- Sessions page shows summary tiles and a median trend chart for the active date range.

### 5) Ingest Status View

1. Create a lightweight Ingest page or drawer.

- Use `src/app/api/ingest/route.ts` and `src/lib/metrics/ingest.ts` for data.
- Display last run, duration, error count, and list of recent files.
- Add navigation entry in `NAV_ITEMS` if a page is created.

Acceptance:

- Users can see last ingest time, recent files, and errors without modifying ingest behavior.

## UX Consistency Pass

- Standardize filter/search layout to the shared “filter card” pattern on Sessions, Tools, Projects.
- Standardize empty and error states to use `EmptyState`/`ErrorState` consistently.
- Maintain spacing guidelines: `space-y-6` for page layout, `gap-4` in grids.

## Testing Plan

1. API-level validation

- Verify sessions filter params return filtered results.
- Verify tool calls filters return expected subsets.
- Verify projects sorting affects order.

2. UI validation

- Check each new filter control updates the list and resets pagination where appropriate.
- Verify sessions table columns render correctly and remain readable on smaller widths.
- Verify tool diagnostics columns render without layout overflow.
- Verify models/providers range parity with Trends for same date range.

3. Regression checks

- Ensure no changes to ingest behavior.
- Ensure existing KPIs and charts remain correct.

## Rollout Plan

1. Ship parity fixes (projects sorting, models/providers date range) first.
2. Ship Sessions enhancements next (filters + detail view).
3. Ship Tools diagnostics and filters.
4. Ship Session medians chart and Ingest status view.

## Open Questions for Confirmation

- Do we want `/models` to be range-aware and show the date picker?
- Should “Model switches” be on session detail only, or also surfaced in a global trends view?
- Do we want a full Ingest page or a compact drawer from the sidebar?
- Is `history.jsonl` explicitly out of scope for ingest expansion?
