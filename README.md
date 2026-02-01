# Codex Observability

<img width="1728" height="993" alt="image" src="https://github.com/user-attachments/assets/50a82c02-6ce1-435b-a8dd-7434ba63843c" />

Local‑only observability dashboard for Codex CLI usage. This app reads your local Codex data in `~/.codex` and visualizes activity, tokens (including cache), model calls, tool‑call success rates, durations, and more. For projects, maps multiple folders or workspaces against single github remote repo.

## What it does

- Live dashboard for tokens, cache utilization, model calls, and sessions
- Tool‑call analytics: success rate, failures, duration trends
- Activity heatmap + per‑session details
- Local‑only storage (SQLite), no outbound telemetry

## Data sources (local)

- `~/.codex/sessions/**/rollout-*.jsonl` (session events)
- `~/.codex/history.jsonl` (first prompt timestamp)
- `~/.codex/log/codex-tui.log` (tool call logs)

## Tech stack

- Next.js (App Router) + TypeScript
- shadcn/ui + Tailwind
- Recharts via shadcn chart components
- SQLite (local)

## Getting started

Install deps:

```bash
pnpm install
```

Run dev server:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Start production server:

```bash
pnpm start
```

Smoke scripts:

```bash
pnpm ingest:smoke
pnpm log:smoke
```

E2E API tests (builds app, starts server, validates all API endpoints):

```bash
pnpm test:e2e
```

## Notes

- This app is designed to run locally and read from your `~/.codex` directory.
- No data is sent externally.

## Project plan

See `INIT.md` for architecture, schema, and execution plan.

## UI docs

See `docs/shadcn.md` for shadcn/ui setup and chart notes.
