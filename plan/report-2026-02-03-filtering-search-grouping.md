# Filtering, Search, Grouping Review

## Executive Summary
This review maps filtering, search, and grouping behavior across the UI and data layer, and highlights cross-screen inconsistencies in components, spacing, and loading/error handling. UI filtering is concentrated on Sessions, Projects, and Tools; other screens (Models, Trends, Activity, Project Detail) are primarily read-only aggregations with no interactive filtering controls. The data layer exposes more filters than the UI uses, especially for Sessions and Tool Calls. The Projects UI wires up sort state and sends `sortBy`/`sortOrder` in the query string, but the API route ignores these parameters even though the data layer supports them. Grouping is implemented in multiple places (projects merged across worktrees, tool-call breakdowns by tool/error, activity grouped by date, model/provider grouping), with UI exposure varying by screen. Error and loading handling differs across pages: some use `ErrorState` + skeletons, others use inline table rows or card messages for empty/not-found states. UI filter layout varies as well: Sessions and Projects use a filter card, while Tools embeds search in the table header. These inconsistencies are all observable in current code and do not infer future changes.

## Scope Reviewed
- `src/app/sessions/page.tsx`
- `src/components/sessions/session-filters.tsx`
- `src/app/tools/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/projects/columns.tsx`
- `src/app/projects/projects-data-table.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/models/page.tsx`
- `src/app/trends/page.tsx`
- `src/app/activity/page.tsx`
- `src/app/page.tsx`
- `src/hooks/use-sessions.ts`
- `src/hooks/use-projects.ts`
- `src/hooks/use-tool-calls.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/tool-calls/route.ts`
- `src/lib/metrics/sessions.ts`
- `src/lib/metrics/projects.ts`
- `src/lib/metrics/tool-calls.ts`
- `src/lib/metrics/models.ts`
- `src/lib/metrics/providers.ts`
- `src/lib/metrics/activity.ts`

## Current Behavior Map
### Entry points
- Sessions list with filters: `src/app/sessions/page.tsx` (stateful filters + pagination). 
- Tools list with search + KPIs + breakdown charts: `src/app/tools/page.tsx`.
- Projects list with search + sortable columns: `src/app/projects/page.tsx` and `src/app/projects/columns.tsx`.
- Project detail: `src/app/projects/[id]/page.tsx`.
- Models and Providers summaries: `src/app/models/page.tsx`.
- Trends and Activity dashboards: `src/app/trends/page.tsx`, `src/app/activity/page.tsx`, `src/app/page.tsx`.

### State/data flow
- UI pages build query params via hooks (`useSessions`, `useProjects`, `useToolCalls`) and call Next.js API routes.
- API routes parse filters and pagination and call data-layer query functions (e.g., `getSessionsList`, `getProjectsList`, `getToolCallsList`).
- Data-layer modules query the local database via `getDatabase` and apply filters, grouping, and aggregations.

### External dependencies
- Local database tables: `session`, `model_call`, `tool_call`, `project`, `project_ref`, `daily_activity` (presence checked via `tableExists`).
- Pricing data for cost calculations: `getPricingSync`, `getPricingForModel`.

### Error handling/cancellation
- Pages generally show `ErrorState` only when `error && !data`; they render skeletons during initial loading. 
- Some screens use inline empty rows or card messages instead of `EmptyState` or `ErrorState` for not-found/empty cases.

## Key Findings (ranked)
1. **Projects sorting is wired in the UI and hook but ignored by the API route**
   - Locations:
     - UI sort state + query includes `sortBy`/`sortOrder`: `src/app/projects/page.tsx:27-38,45-55`.
     - Hook sends `sortBy`/`sortOrder` query params: `src/hooks/use-projects.ts:22-32`.
     - API route only parses `search` and ignores sort params: `src/app/api/projects/route.ts:22-33`.
     - Data layer supports sorting (`sortBy`, `sortOrder`): `src/lib/metrics/projects.ts:21-27,238-239`.
   - Observation: UI exposes column sorting, and the hook sends sort params, but the API route does not pass them to `getProjectsList`.
   - Relevance: This is a UI–data-layer mismatch in grouping/sorting capabilities.

2. **Data layer exposes more filters than the UI uses (Sessions + Tool Calls)**
   - Sessions:
     - UI filters: search, model, provider, project: `src/app/sessions/page.tsx:24-38` and `src/components/sessions/session-filters.tsx:12-79`.
     - API supports additional filters: `branch`, `worktree`, `originator`, `cliVersion`: `src/app/api/sessions/route.ts:21-29`.
     - Data layer enforces these filters: `src/lib/metrics/sessions.ts:50-103`.
   - Tool Calls:
     - UI exposes only search: `src/app/tools/page.tsx:40-58,157-168`.
     - API supports `status`, `tools`, `sessionId`, `exitCode`, `hasError`, `minDurationMs`, `maxDurationMs`, `project`: `src/app/api/tool-calls/route.ts:26-48`.
     - Data layer applies those filters: `src/lib/metrics/tool-calls.ts:40-95`.
   - Observation: Several filters exist at the API/data layer but have no UI controls, leading to uneven filter capabilities across screens.
   - Relevance: This is a UI/data-layer inconsistency in filtering/search exposure.

3. **Grouping is implemented in the data layer, with partial or inconsistent UI exposure**
   - Projects list groups multiple worktrees/checkouts into one logical project via merge key: `src/lib/metrics/projects.ts:8-16,178-235`.
   - Project detail aggregates across grouped project IDs (canonical name) and groups branches/worktrees: `src/lib/metrics/projects.ts:452-533` and UI table uses a sorted branches list: `src/app/projects/[id]/page.tsx:199-231`.
   - Tool calls breakdowns group by `tool_name` and `error`: `src/lib/metrics/tool-calls.ts:213-263`, visualized in Tools charts: `src/app/tools/page.tsx:150-155`.
   - Activity groups by date in fallback mode: `src/lib/metrics/activity.ts:90-149`.
   - Models/Providers group by model/provider: `src/lib/metrics/models.ts:67-105`, `src/lib/metrics/providers.ts:70-96`.
   - Observation: Grouping exists across several data domains; UI surfaces grouping in some places (tool breakdown charts, project branches) but not uniformly (no UI grouping controls elsewhere).
   - Relevance: Identifies where grouping logic exists vs. where UI surfaces it.

4. **Inconsistent UI components and layout patterns for filters/search**
   - Sessions and Projects use a filter/search card with `rounded-lg border bg-card p-4`: `src/components/sessions/session-filters.tsx:33-80`, `src/app/projects/page.tsx:95-106`.
   - Tools embeds the search input inside the table card header instead of a dedicated filter card: `src/app/tools/page.tsx:157-168`.
   - Observation: Filtering/search UI placement and surrounding layout differs by screen.
   - Relevance: This is a visible UI inconsistency across screens.

5. **Inconsistent loading, empty, and error handling patterns**
   - Sessions: `TableSkeleton` + `ErrorState` + inline table empty row (`No sessions found` in `SessionsTable`): `src/app/sessions/page.tsx:93-99`, `src/components/sessions/sessions-table.tsx:63-79`.
   - Tools: KPI skeletons + table skeleton + inline empty row (`No tool calls recorded`): `src/app/tools/page.tsx:136-218`.
   - Projects: `ChartSkeleton` + `TableSkeleton` + `EmptyState` component for empty data: `src/app/projects/page.tsx:108-126`.
   - Project Detail: uses `ErrorState` for load errors but uses a `Card` message for invalid ID or not found: `src/app/projects/[id]/page.tsx:74-107`.
   - Models: table-level empty rows for both models and providers: `src/app/models/page.tsx:86-188`.
   - Observation: Different screens use different patterns for empty and not-found cases (inline table rows vs `EmptyState` vs card message), and skeleton usage is not consistent.
   - Relevance: Explicit inconsistency across screens in loading and error/empty handling.

## Candidate Change Points (not an implementation plan)
- Align Projects sorting across UI, API, and data-layer (`src/app/projects/page.tsx`, `src/hooks/use-projects.ts`, `src/app/api/projects/route.ts`, `src/lib/metrics/projects.ts`). Behavior must remain identical.
- Decide whether to expose additional API filters in UI (Sessions/Tool Calls) or remove unused query params (`src/app/sessions/page.tsx`, `src/components/sessions/session-filters.tsx`, `src/app/tools/page.tsx`, `src/app/api/sessions/route.ts`, `src/app/api/tool-calls/route.ts`). Behavior must remain identical.
- Standardize filter/search layout (dedicated filter card vs table header search) and empty/error handling patterns across screens (`src/app/sessions/page.tsx`, `src/app/tools/page.tsx`, `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/models/page.tsx`). Behavior must remain identical.

## Risks and Guardrails
- Any changes to API query handling must preserve existing cache keys and pagination behavior (`src/app/api/projects/route.ts`, `src/lib/performance/cache`).
- Grouping logic in projects (merge key and canonical name grouping) is core to the project rollups; avoid altering grouping semantics without explicit intent (`src/lib/metrics/projects.ts:8-16,452-478`).
- Error handling currently relies on `ErrorState` only when `error && !data`—adjustments should preserve this to avoid UI flicker during refreshes.

## Open Questions/Assumptions
- Assumed that UI should reflect all available API filters; if not, confirm which filters are intentionally hidden.
- Assumed that Projects sorting is intended to be server-driven (due to `manualPagination`); if client-side sort is intended, confirm.
- Assumed that inconsistent empty/error handling is not intentional per page.

## References (paths only)
- `src/app/sessions/page.tsx`
- `src/components/sessions/session-filters.tsx`
- `src/components/sessions/sessions-table.tsx`
- `src/app/tools/page.tsx`
- `src/app/projects/page.tsx`
- `src/app/projects/columns.tsx`
- `src/app/projects/projects-data-table.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/models/page.tsx`
- `src/app/trends/page.tsx`
- `src/app/activity/page.tsx`
- `src/app/page.tsx`
- `src/hooks/use-projects.ts`
- `src/hooks/use-sessions.ts`
- `src/hooks/use-tool-calls.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/route.ts`
- `src/app/api/tool-calls/route.ts`
- `src/lib/metrics/sessions.ts`
- `src/lib/metrics/projects.ts`
- `src/lib/metrics/tool-calls.ts`
- `src/lib/metrics/models.ts`
- `src/lib/metrics/providers.ts`
- `src/lib/metrics/activity.ts`
