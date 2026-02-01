# Observability Expansion Improvements

Enhance the recently implemented Projects, Models, and Tools pages with richer features, visualizations, and logic to connect multiple folders that share the same git remote origin.

## User Review Required

> [!IMPORTANT]
> **Git Remote Detection**: The plan proposes detecting git remote origin from the filesystem (`.git/config`) to link folders with the same repository. This adds a filesystem dependency beyond the existing JSONL parsing. Please confirm this approach is acceptable.

> [!WARNING]
> **Breaking Change to Project IDs**: Currently `projectId` is hashed from `{name, root_path}`. To support multi-folder project linking, we need to prioritize `git_remote` in the hash when available. This will cause existing projects to get new IDs on first re-ingest if they have a git remote. Consider running a migration to preserve historical data.

---

## Summary of Current State

| Page               | Current State                                           | Missing                                                                      |
| ------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Projects**       | Basic table (sessions, tokens, cache hit, tool success) | Charts, filters, cost estimates, trend indicators                            |
| **Project Detail** | KPI cards + branch/worktree table                       | Token breakdown charts, session timeline, tool failure breakdown             |
| **Models**         | Two tabs (Models/Providers) with tables                 | Usage trend charts, reasoning token display, token breakdown pie             |
| **Tools**          | KPI grid + tool call table                              | Breakdown charts (by tool, by status), failure ranking, noisy tool detection |

**Key Missing Logic**: `git_remote` column is always `null`. Different folders pointing to the same git repo are treated as separate projects.

---

## Proposed Changes

### Component 1: Project Connection via Git Remote

Detect git remote and use it to link multiple folders that belong to the same repository.

---

#### [MODIFY] [project-id.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/ingestion/project-id.ts)

- Add `detectGitRemote(cwd: string): string | null` function
  - Read `.git/config` from `cwd` or parent directories
  - Parse `[remote "origin"]` section to extract URL
  - Normalize URL (strip `.git` suffix, convert SSH to HTTPS format for consistency)
- Update `deriveProjectAndRef()` to:
  - Call `detectGitRemote(cwd)` and set `git_remote` on project insert
  - When `git_remote` is available, derive `projectId` from `git_remote` instead of `{name, root_path}` so multiple worktrees merge into one project

---

#### [NEW] [git-utils.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/ingestion/git-utils.ts)

```typescript
export function detectGitRemote(cwd: string): string | null { ... }
export function normalizeGitUrl(url: string): string { ... }
export function findGitRoot(startPath: string): string | null { ... }
```

---

### Component 2: Enrich Projects Page

Add visualizations, trend indicators, and filtering.

---

#### [MODIFY] [page.tsx](file:///Users/stephenwalker/Code/codex-observ/src/app/projects/page.tsx)

- Add KPI summary row at top (total projects, total tokens across projects, avg cache hit, avg tool success)
- Add trend indicators (vs previous period) on each project row
- Add column for estimated cost (use existing pricing logic)
- Add filter dropdowns: time range (already exists), minimum sessions threshold
- Add sortable columns (click to sort by sessions, tokens, cache hit, etc.)

---

#### [NEW] [projects-chart.tsx](file:///Users/stephenwalker/Code/codex-observ/src/components/projects/projects-chart.tsx)

- Bar chart showing top 10 projects by token usage
- Use Recharts (already in codebase)

---

### Component 3: Enrich Project Detail Page

Add charts and deeper breakdowns.

---

#### [MODIFY] [page.tsx](file:///Users/stephenwalker/Code/codex-observ/src/app/projects/%5Bid%5D/page.tsx)

- Add token breakdown pie chart (input / cached / output / reasoning)
- Add sessions-over-time line chart
- Add model usage breakdown for this project
- Add tool failure summary (top failing tools within this project)
- Show git remote URL (clickable link to GitHub/GitLab if detected)
- Show all linked paths (multiple cwds that share this git remote)

---

#### [MODIFY] [projects.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/metrics/projects.ts)

- Add `getProjectTokenBreakdown(projectId, range)` returning input/cached/output/reasoning totals
- Add `getProjectSessionsOverTime(projectId, range)` returning daily session counts
- Add `getProjectModelUsage(projectId, range)` returning per-model breakdown
- Add `getProjectToolFailures(projectId, range, limit)` returning top failing tools
- Add `getProjectLinkedPaths(projectId)` returning all unique cwds

---

#### [MODIFY] [route.ts](file:///Users/stephenwalker/Code/codex-observ/src/app/api/projects/%5Bid%5D/route.ts)

- Extend response to include `tokenBreakdown`, `sessionsOverTime`, `modelUsage`, `topFailures`, `linkedPaths`

---

### Component 4: Enrich Models Page

Add visualizations and reasoning token display.

---

#### [MODIFY] [page.tsx](file:///Users/stephenwalker/Code/codex-observ/src/app/models/page.tsx)

- Add KPI summary row (total models used, total tokens, avg cache hit)
- Add reasoning tokens column to Models table
- Add pie chart showing token distribution by model
- Add line chart showing model usage trend over time
- Add provider pie chart on Providers tab

---

#### [NEW] [models-charts.tsx](file:///Users/stephenwalker/Code/codex-observ/src/components/models/models-charts.tsx)

- `ModelDistributionPie` - token breakdown by model
- `ModelUsageTrend` - calls over time stacked by model

---

#### [MODIFY] [models.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/metrics/models.ts)

- Add `getModelUsageOverTime(range)` returning daily breakdown by model
- Ensure reasoning tokens are included in model response

---

### Component 5: Enrich Tools Page

Add breakdown charts and failure analysis.

---

#### [MODIFY] [page.tsx](file:///Users/stephenwalker/Code/codex-observ/src/app/tools/page.tsx)

- Add breakdown bar chart: calls by tool name
- Add breakdown bar chart: failures by tool name
- Add "Noisy tools" section showing tools with highest stdout/stderr bytes
- Add error message frequency ranking
- Add pagination to tool call table

---

#### [NEW] [tools-charts.tsx](file:///Users/stephenwalker/Code/codex-observ/src/components/tools/tools-charts.tsx)

- `ToolCallsBreakdown` - horizontal bar chart by tool name
- `ToolFailuresChart` - failures by tool
- `NoisyToolsTable` - tools ranked by output bytes

---

#### [MODIFY] [tool-calls.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/metrics/tool-calls.ts)

- Add `getToolCallsByName(range)` returning per-tool-name breakdown
- Add `getNoisyTools(range, limit)` returning tools by stdout+stderr bytes
- Add `getErrorMessageRanking(range, limit)` returning top error messages

---

### Component 6: Shared Enhancements

---

#### [NEW] [trend-indicator.tsx](file:///Users/stephenwalker/Code/codex-observ/src/components/shared/trend-indicator.tsx)

- Reusable component showing up/down arrow with percentage change
- Already partially exists in KPI cards, extract to shared component

---

#### [MODIFY] [constants.ts](file:///Users/stephenwalker/Code/codex-observ/src/lib/constants.ts)

- Add `formatGitUrl(url)` to display short repo name from git remote URL

---

## Verification Plan

### Automated Tests

There's an existing test structure in `/tests`:

```
tests/
├── ingestion.test.ts
├── log-parser.test.ts
├── metrics.test.ts
├── pricing.test.ts
├── setup.ts
```

**Run existing tests:**

```bash
pnpm test
```

**New tests to add:**

1. **[NEW] `tests/git-utils.test.ts`**
   - Test `detectGitRemote()` with mock `.git/config` files
   - Test `normalizeGitUrl()` with SSH and HTTPS formats
   - Test edge cases: no git dir, no remote, unusual config

2. **[MODIFY] `tests/ingestion.test.ts`**
   - Add test case verifying that two sessions with same git remote get same `projectId`
   - Add test case verifying that `git_remote` is populated

3. **[MODIFY] `tests/metrics.test.ts`**
   - Add tests for new metrics functions (`getProjectTokenBreakdown`, etc.)

```bash
# Run all tests after implementation
pnpm test
```

### Manual Verification

1. **Git Remote Detection**
   - Run the app with `pnpm dev`
   - Navigate to `/projects`
   - Verify projects with git remotes show the remote URL
   - Verify two different local folders pointing to same repo appear as one project

2. **Projects Page Enhancements**
   - Verify KPI summary row shows aggregate stats
   - Verify bar chart displays top projects
   - Verify trend indicators show correct direction

3. **Project Detail Page**
   - Click into a project
   - Verify pie chart shows token breakdown
   - Verify sessions-over-time chart renders
   - Verify linked paths section shows multiple cwds if applicable

4. **Models Page**
   - Verify reasoning tokens column displays in table
   - Verify pie chart shows model distribution
   - Verify trend line chart renders

5. **Tools Page**
   - Verify breakdown charts render
   - Verify noisy tools section displays tools with high output

### Browser Visual Verification

Use browser to verify charts render correctly at:

- `http://localhost:3001/projects`
- `http://localhost:3001/projects/{id}`
- `http://localhost:3001/models`
- `http://localhost:3001/tools`

---

## Implementation Order

1. **Phase 1: Git Remote Detection** (enables project linking)
   - Create `git-utils.ts`
   - Modify `project-id.ts`
   - Add `tests/git-utils.test.ts`
   - Run tests

2. **Phase 2: Projects Enhancements**
   - Modify metrics layer
   - Modify API route
   - Create chart components
   - Update pages

3. **Phase 3: Models Enhancements**
   - Modify metrics layer
   - Create chart components
   - Update page

4. **Phase 4: Tools Enhancements**
   - Modify metrics layer
   - Create chart components
   - Update page

5. **Phase 5: Final Testing**
   - Run full test suite
   - Manual browser verification
