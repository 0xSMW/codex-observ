# E2E API Validation Test Suite Spec (2026-02-01)

## 1. Executive Summary

This spec defines a test suite that validates the Codex Observability app's APIs end-to-end, ensuring the app is working correctly and providing accurate insights. The suite will:

1. **Contract validation** — Verify API responses match the expected JSON shapes and types.
2. **Insight correctness** — Validate that metrics (tokens, cache hit rate, success rate, cost, etc.) are computed correctly from known data.
3. **Behavioral validation** — Test date filtering, pagination, filters, and error handling.

The suite will run against a seeded database with deterministic fixtures so that assertions are repeatable and CI-friendly. It builds on the existing `verify-dashboard-data.mjs` script and `scripts/ingest-smoke.ts` approach but formalizes them into a structured, maintainable test framework.

---

## 2. Scope

### 2.1 APIs in scope

| Endpoint             | Method | Purpose                                                                                      |
| -------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/api/overview`      | GET    | KPIs and daily series (tokens, cache, sessions, model calls, tool calls, success rate, cost) |
| `/api/sessions`      | GET    | Paginated session list with filters                                                          |
| `/api/sessions/[id]` | GET    | Session detail (messages, model calls, tool calls)                                           |
| `/api/models`        | GET    | Model-level token/cost stats                                                                 |
| `/api/providers`     | GET    | Provider-level stats                                                                         |
| `/api/projects`      | GET    | Project list with rollups (sessions, tokens, cache hit rate, tool success)                   |
| `/api/projects/[id]` | GET    | Project detail with branch/worktree breakdown                                                |
| `/api/tool-calls`    | GET    | Tool call list with summary and filters                                                      |
| `/api/tool-events`   | GET    | Tool call event timelines (start/exit/failure events)                                        |
| `/api/activity`      | GET    | Activity heatmap and summary                                                                 |
| `/api/ingest`        | GET    | Ingest status                                                                                |
| `/api/ingest`        | POST   | Trigger ingest (incremental/full)                                                            |
| `/api/sync-status`   | GET    | Last sync time                                                                               |

**Note:** `project`, `project_ref`, `session_context`, and `tool_call_event` tables were added recently; `src/lib/metrics/projects.ts` provides `getProjectsList` and `getProjectDetail`. The projects API routes and tool-events API may be implemented alongside or after the test suite.

**Out of scope (for this spec):**

- `/api/events` — SSE stream; requires different testing strategy (integration/manual).
- Browser/UI E2E — Covered by a separate spec if needed.

### 2.2 Insights to validate

The app surfaces these core insights. Tests must verify they are correct:

| Insight              | Source API           | Key assertions                                                                          |
| -------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| Total tokens         | overview             | `kpis.totalTokens.value` matches sum of `model_call.total_tokens`                       |
| Cache hit rate       | overview             | `cached_input / input` matches `kpis.cacheHitRate.value`                                |
| Sessions count       | overview             | `kpis.sessions.value` matches `COUNT(session)` in range                                 |
| Model calls count    | overview             | `kpis.modelCalls.value` matches `COUNT(model_call)`                                     |
| Tool calls count     | overview             | `kpis.toolCalls.value` matches `COUNT(tool_call)`                                       |
| Tool success rate    | overview, tool-calls | `ok / total` matches `summary.successRate`                                              |
| Total cost           | overview, models     | Cost derived from tokens × pricing (best-effort)                                        |
| Daily series         | overview             | `series.daily` dates and values align with DB aggregates                                |
| Session list         | sessions             | Pagination, totals, per-session token/call counts; optional `project`, `branch` filters |
| Session detail       | sessions/[id]        | Messages, model calls, tool calls belong to session                                     |
| Model rollups        | models               | Per-model call count, tokens, cost                                                      |
| Provider rollups     | providers            | Per-provider session/call/token counts                                                  |
| Project rollups      | projects             | Per-project session count, tokens, cache hit rate, tool success rate                    |
| Project detail       | projects/[id]        | Project metadata plus branch/worktree breakdown                                         |
| Tool event timelines | tool-events          | Start/exit/failure events per tool call                                                 |
| Activity             | activity             | Per-day message/call/token totals match DB                                              |

---

## 3. Architecture

### 3.1 Test framework

**Recommended: Vitest**

- Fast, native ESM, built-in TypeScript support.
- No Jest config drift; works well with Next.js.
- `pnpm add -D vitest` (per AGENTS.md: use pnpm, not direct package.json edit).

**Alternative: Node.js script + structured assertions**

- Extend `verify-dashboard-data.mjs` with stricter assertions.
- Pros: No new dependency, already works.
- Cons: Less structured, no parallelization, weaker DX.

**Decision:** Start with Vitest for structure and CI integration. Use `vitest run` for CI; `vitest` for watch mode during development.

### 3.2 Execution model

1. **Setup:** Create a temp SQLite DB; run ingestion with fixture data.
2. **Server:** Start Next.js in test mode (`next start` or programmatic server) bound to a random port.
3. **Run tests:** Hit `http://localhost:{port}/api/*` with `fetch`.
4. **Teardown:** Stop server, optionally delete temp DB.

**Fixture-driven:** All tests use the same seeded data from `src/lib/ingestion/__fixtures__/` (and any additional fixtures added for edge cases). No dependence on `~/.codex` or live data.

### 3.3 Environment

- `CODEX_OBSERV_DB_PATH` — Point to temp DB during tests.
- `CODEX_HOME` or fixture path — Point ingestion to `__fixtures__` directory.
- Port — Use `0` for Next.js to pick a free port, or `process.env.TEST_PORT`.

---

## 4. Test Categories

### 4.1 Contract tests (JSON shape)

- Validate response structure: required keys present, types correct.
- Use `src/types/api.ts` as the schema source.
- Lightweight runtime checks: `typeof`, `Array.isArray`, `object !== null`.

**Example:** `OverviewResponse` must have `kpis`, `series`, `range` (optional). Each KPI must have `value`, `previous`, `delta`, `deltaPct`.

### 4.2 Correctness tests (insight validation)

- Compare API responses to direct DB queries over the same range.
- Assert: `overview.kpis.totalTokens.value === sum(model_call.total_tokens)`.
- Use the same range params for both API and DB.

### 4.3 Behavioral tests

- **Date range:** `startDate`/`endDate` filter data correctly; invalid dates return 400.
- **Pagination:** `page`, `pageSize`, `limit`, `offset`; no duplicates, correct `total`.
- **Filters:** `models`, `providers`, `search`, `status`, `tools`, `sessionId`; filtered results match expectations.
- **Edge cases:** Empty range, non-existent session id → 404, malformed query → 400.

### 4.4 Idempotency and ingestion

- Re-ingest same fixtures → identical DB state.
- POST `/api/ingest` → status becomes `idle`, `lastResult` populated.

---

## 5. Fixture and Data Strategy

### 5.1 Existing fixtures

- `src/lib/ingestion/__fixtures__/sessions/2025/01/01/rollout-0001.jsonl`
- `session_meta.jsonl`, `turn_context.jsonl`, `response_item.jsonl`, `event_msg.jsonl`
- `codex-tui.log` (tool calls)

### 5.2 Additional fixtures (optional, for edge cases)

- **Empty range:** Use a date range with no data; assert zeros and empty arrays.
- **Pagination boundary:** Fixture with exactly 50 sessions to test page boundary.
- **Multiple models/providers:** Fixture with 2+ models to validate rollups.
- **Tool failures:** Fixture with `status=ok` and `status=failed` tool calls for success rate.

### 5.3 Seed script

Create `scripts/seed-test-db.ts`:

1. Set `CODEX_OBSERV_DB_PATH` to temp path.
2. Call `ingestAll(fixturePath)` with `__fixtures__` path.
3. Export DB path for tests.
4. Optionally run once per test file (via `beforeAll`) or once per worker.

---

## 6. Detailed Test Cases by Endpoint

### 6.1 `GET /api/overview`

| Test        | Description    | Assertions                                                                             |
| ----------- | -------------- | -------------------------------------------------------------------------------------- |
| Contract    | Response shape | `kpis`, `series.daily`, `range`; each KPI has `value`, `previous`, `delta`, `deltaPct` |
| Correctness | Token totals   | `kpis.totalTokens.value` === sum of `model_call.total_tokens` in range                 |
| Correctness | Cache hit rate | `kpis.cacheHitRate.value` === `cached_input / input` (or 0 if no input)                |
| Correctness | Sessions       | `kpis.sessions.value` === COUNT(session) in range                                      |
| Correctness | Model calls    | `kpis.modelCalls.value` === COUNT(model_call) in range                                 |
| Correctness | Tool calls     | `kpis.toolCalls.value` === COUNT(tool_call) in range                                   |
| Correctness | Success rate   | `kpis.successRate.value` === ok/total for tool_call in range                           |
| Behavioral  | Date range     | Query with `startDate`/`endDate`; results filtered to range                            |
| Behavioral  | Default range  | No params → last 30 days                                                               |
| Behavioral  | Invalid date   | `startDate=invalid` → 400, `error`, `code` in body                                     |

### 6.2 `GET /api/sessions`

| Test        | Description    | Assertions                                                                             |
| ----------- | -------------- | -------------------------------------------------------------------------------------- |
| Contract    | Response shape | `sessions`, `pagination`, `filters`, `range`                                           |
| Contract    | Session item   | Each has `id`, `ts`, `tokens`, `messageCount`, `modelCallCount`, `toolCallCount`, etc. |
| Correctness | Pagination     | `pagination.total` === total sessions in range; `sessions.length` ≤ pageSize           |
| Correctness | Session tokens | For a session, `tokens.total` === sum of model_call total_tokens for that session      |
| Behavioral  | Pagination     | `page=2`, `pageSize=10` → correct offset, no overlap with page 1                       |
| Behavioral  | Filters        | `models=gpt-4` → only sessions with that model                                         |
| Behavioral  | Search         | `q=foo` → sessions matching search (if implemented)                                    |
| Behavioral  | Project filter | `project=id` → only sessions with that project_id (if implemented)                     |
| Behavioral  | Branch filter  | `branch=main` → only sessions with that branch (if implemented)                        |

### 6.3 `GET /api/sessions/[id]`

| Test        | Description      | Assertions                                                                        |
| ----------- | ---------------- | --------------------------------------------------------------------------------- |
| Contract    | Response shape   | `session`, `stats`, `messages`, `modelCalls`, `toolCalls`; each with `pagination` |
| Correctness | Session identity | `session.id` === requested id                                                     |
| Correctness | Messages         | All `messages.items` have `session_id` === id                                     |
| Correctness | Model calls      | All `modelCalls.items` belong to session                                          |
| Correctness | Tool calls       | All `toolCalls.items` belong to session (or sessionId matches)                    |
| Behavioral  | Not found        | Non-existent id → 404, `error`, `code: 'not_found'`                               |

### 6.4 `GET /api/models`

| Test        | Description    | Assertions                                                                |
| ----------- | -------------- | ------------------------------------------------------------------------- |
| Contract    | Response shape | `models`, `pagination`, `range`                                           |
| Contract    | Model item     | Each has `model`, `callCount`, `tokens`, `avgDurationMs`, `estimatedCost` |
| Correctness | Rollups        | Per-model call count and token sum match DB                               |
| Behavioral  | Pagination     | Works as in sessions                                                      |

### 6.5 `GET /api/providers`

| Test        | Description    | Assertions                                |
| ----------- | -------------- | ----------------------------------------- |
| Contract    | Response shape | `providers`, `pagination`, `range`        |
| Correctness | Rollups        | Per-provider session/call counts match DB |

### 6.6 `GET /api/projects`

| Test        | Description    | Assertions                                                                                                       |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Contract    | Response shape | `projects`, `pagination`, `range`                                                                                |
| Contract    | Project item   | Each has `id`, `name`, `rootPath`, `gitRemote`, `sessionCount`, `totalTokens`, `cacheHitRate`, `toolSuccessRate` |
| Correctness | Rollups        | Per-project session count, token sum, cache hit rate, tool success rate match DB                                 |
| Behavioral  | Date range     | Query with `startDate`/`endDate`; results filtered to sessions in range                                          |
| Behavioral  | Pagination     | `page`, `pageSize`; `pagination.total` matches COUNT(DISTINCT project_id) in range                               |
| Behavioral  | Search         | `q=foo` or `search=foo` → projects matching name/rootPath (if implemented)                                       |
| Behavioral  | Empty projects | No sessions with project_id → empty list, not error                                                              |

### 6.7 `GET /api/projects/[id]`

| Test        | Description      | Assertions                                                                                 |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------ |
| Contract    | Response shape   | `project`, `branches`, `range`                                                             |
| Contract    | Project          | `id`, `name`, `rootPath`, `sessionCount`, `totalTokens`, `cacheHitRate`, `toolSuccessRate` |
| Contract    | Branches         | Each branch has `branch`, `commit`, `sessionCount`                                         |
| Correctness | Project identity | `project.id` === requested id                                                              |
| Correctness | Branches         | `branches` list matches project_ref rows for this project                                  |
| Behavioral  | Not found        | Non-existent project id → 404 or empty project/branches                                    |

### 6.8 `GET /api/tool-events`

| Test        | Description                 | Assertions                                                                                        |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| Contract    | Response shape              | `events`, `pagination`, `range` (or equivalent)                                                   |
| Contract    | Event item                  | Each has `id`, `tool_name`, `event_type` (start/exit/failure), `ts`, `correlation_key`, `payload` |
| Correctness | Events belong to tool calls | Events correlate to tool_call records via correlation_key                                         |
| Behavioral  | Filters                     | `sessionId`, `correlationKey`, `toolName` (if implemented)                                        |
| Behavioral  | Date range                  | Events filtered by `ts` in range                                                                  |

### 6.9 `GET /api/tool-calls`

| Test        | Description    | Assertions                                                                       |
| ----------- | -------------- | -------------------------------------------------------------------------------- |
| Contract    | Response shape | `toolCalls`, `summary`, `pagination`, `filters`, `range`                         |
| Contract    | Summary        | `summary` has `total`, `ok`, `failed`, `unknown`, `successRate`, `avgDurationMs` |
| Correctness | Summary        | `summary.total` === COUNT(tool_call), `summary.successRate` === ok/total         |
| Behavioral  | Filters        | `status=ok`, `tools=run_terminal_cmd`                                            |

### 6.10 `GET /api/activity`

| Test        | Description    | Assertions                                                    |
| ----------- | -------------- | ------------------------------------------------------------- |
| Contract    | Response shape | `activity`, `summary`, `range`                                |
| Contract    | Activity point | Each has `date`, `messageCount`, `callCount`, `tokenTotal`    |
| Correctness | Per-day        | Aggregates match DB GROUP BY date                             |
| Correctness | Summary        | `summary.totalMessages`, `totalCalls`, `totalTokens` match DB |

### 6.11 `GET /api/ingest`

| Test     | Description    | Assertions                        |
| -------- | -------------- | --------------------------------- |
| Contract | Response shape | `status`, `lastRun`, `lastResult` |
| Contract | Status enum    | `status` in `['idle', 'running']` |

### 6.12 `POST /api/ingest`

| Test       | Description    | Assertions                                |
| ---------- | -------------- | ----------------------------------------- |
| Contract   | Response shape | `status`, `lastRun`, `lastResult`         |
| Behavioral | Mode           | `{ mode: 'full' }` vs default incremental |

### 6.13 `GET /api/sync-status`

| Test     | Description    | Assertions                      |
| -------- | -------------- | ------------------------------- |
| Contract | Response shape | `lastSyncedAt` (string or null) |

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

- [ ] Add Vitest: `pnpm add -D vitest`
- [ ] Add `vitest.config.ts` with ESM, path aliases, test env
- [ ] Create `scripts/seed-test-db.ts` (or `tests/setup.ts`)
- [ ] Add `tests/e2e/` directory
- [ ] Implement server startup helper (e.g. `startTestServer()`)
- [ ] One smoke test: `GET /api/overview` returns 200 and has `kpis`

### Phase 2: Contract tests (Week 1–2)

- [ ] Contract tests for all GET endpoints
- [ ] Use shared helpers: `expectOverviewShape`, `expectSessionsShape`, etc.
- [ ] Optionally generate guards from `src/types/api.ts` (manual or zod)

### Phase 3: Correctness tests (Week 2)

- [ ] DB query helpers mirroring `lib/metrics/*` logic
- [ ] Overview correctness (tokens, cache, sessions, calls, success rate)
- [ ] Sessions pagination correctness
- [ ] Activity correctness

### Phase 4: Behavioral tests (Week 2–3)

- [ ] Date range validation (valid, invalid, default)
- [ ] Pagination edge cases
- [ ] Filter behavior
- [ ] 404 for missing session

### Phase 5: CI and polish (Week 3)

- [ ] Add `pnpm test:e2e` script
- [ ] CI workflow (e.g. GitHub Actions) runs `pnpm test:e2e` on PR
- [ ] Document how to run locally: `CODEX_OBSERV_DB_PATH=... pnpm test:e2e`
- [ ] Optionally integrate with `verify-dashboard-data.mjs` as a pre-check

---

## 8. File Structure

```
tests/
├── setup.ts                 # Vitest setup: seed DB, env vars
├── helpers/
│   ├── server.ts            # Start Next.js on random port
│   ├── db.ts                # Direct DB queries for correctness checks
│   └── assertions.ts        # Shared assertion helpers
├── e2e/
│   ├── overview.test.ts
│   ├── sessions.test.ts
│   ├── sessions-detail.test.ts
│   ├── models.test.ts
│   ├── providers.test.ts
│   ├── projects.test.ts
│   ├── projects-detail.test.ts
│   ├── tool-calls.test.ts
│   ├── tool-events.test.ts
│   ├── activity.test.ts
│   └── ingest.test.ts
└── fixtures/                # Optional extra fixtures
    └── (if needed)
```

---

## 9. Cross-Cutting Concerns

### 9.1 Date range

- All range-accepting endpoints support: `startDate`, `endDate`, `start`, `end`, `from`, `since`, `to`, `until`
- Tests should use ISO strings: `startDate=2025-01-01T00:00:00.000Z`
- Default range: last 30 days (aligned with `getDefaultRange()`)

### 9.2 Error responses

- Shape: `{ error: string, code: string }`
- Status: 400 for invalid query, 404 for not found, 500 for internal
- Assert: `res.status`, `body.error`, `body.code`

### 9.3 Pagination

- Params: `page`, `pageSize`, `limit`, `offset`
- Response: `{ limit, offset, total, page, pageSize }`
- Assert: `pageSize === limit`, `total` matches DB count, no duplicate ids across pages

---

## 10. Risks and Mitigations

| Risk                             | Mitigation                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| Flaky tests from shared DB state | Each test file or worker uses fresh seeded DB; avoid mutations that affect other tests |
| Pricing data changes             | Mock pricing or use deterministic fixture; cost assertions can be approximate          |
| Next.js server startup slow      | Start once per worker; reuse across tests in same file                                 |
| Fixtures too small               | Add minimal fixtures for edge cases; avoid large files                                 |
| Events SSE hard to test          | Defer to manual or separate integration test                                           |

---

## 11. Acceptance Criteria

- [ ] All 13 API endpoints (overview, sessions, sessions/[id], models, providers, projects, projects/[id], tool-calls, tool-events, activity, ingest GET/POST, sync-status; excluding events) have at least one contract test
- [ ] Overview, sessions, activity, tool-calls, projects have correctness tests validating key insights
- [ ] Date range, pagination, and error handling have behavioral tests
- [ ] Suite runs in < 60 seconds
- [ ] `pnpm test:e2e` passes in CI with no external dependencies (no live ~/.codex)
- [ ] README or CONTRIBUTING documents how to run the suite

---

## 12. References

- `src/app/api/` — API route implementations
- `src/types/api.ts` — Response types
- `src/lib/metrics/` — Metrics computation (overview, sessions, projects, etc.)
- `scripts/verify-dashboard-data.mjs` — Existing verification script
- `scripts/ingest-smoke.ts` — Ingestion smoke test
- `src/lib/ingestion/__fixtures__/` — Fixture data
- `INIT.md` — Architecture, schema, Agent C contract test mention
