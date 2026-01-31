# Multi-agent Orchestration (Codex CLI)

## Scope
This repo uses multiple Codex agents for parallelizable work. Treat “agent” as either:
- A separate Codex process (`codex exec` / separate terminal sessions)
- A single session that internally fans out to sub‑agents (prompt‑driven)

Project stack: Next.js + TypeScript + shadcn/ui.

## Recommended Approach (explicit, controllable)
Use **multiple independent Codex processes** for predictable parallelism.

### Orchestrator workflow
1. Break the task into 3–6 parallel workstreams.
2. Write a short brief for each agent: scope, inputs, expected outputs, file paths.
3. Spawn one `codex exec` per agent with an isolated working directory and config overrides.
4. Collect outputs to `agent-results/` and merge in the main session.

### Command templates
```bash
# Agent A (example)
mkdir -p agent-results/agent-a
codex exec -C /path/to/repo \
  -m gpt-5-codex \
  -c approval_policy="on-request" \
  --json \
  -o agent-results/agent-a/last-message.md \
  "(Agent A brief goes here)" &

# Agent B (example)
mkdir -p agent-results/agent-b
codex exec -C /path/to/repo \
  -m gpt-5-codex \
  -c approval_policy="on-request" \
  --json \
  -o agent-results/agent-b/last-message.md \
  "(Agent B brief goes here)" &

wait
```

```bash
# Resume last session for a specific agent
codex exec resume --last "Follow-up instructions for agent"
```

### Output format (per agent)
Each agent should output a short Markdown note containing:
- Summary of findings
- Files changed or proposed
- Risks / unknowns
- Next steps

## Expert orchestration playbook
- Start with a dependency graph: list tasks, then mark blockers; only parallelize independent work.
- Write briefs as contracts: **goal**, **inputs**, **non-goals**, **files**, **acceptance criteria**.
- Force single‑ownership per file: one agent per file/area to avoid merge collisions.
- Use “thin slice” milestones: get a minimal end‑to‑end path working before deepening.
- Require evidence: ask agents to cite exact file paths and the commands they ran.
- Centralize decisions: one orchestrator decides defaults (stack, schema, UX direction).
- Keep scope tight: cap each agent to ≤ 3 deliverables and ≤ 2 files when possible.
- Timebox: if an agent stalls, interrupt and request partial output.

## Gotchas (common failure modes)
- Overlapping edits: parallel agents touching the same file causes hard merges and regressions.
- Unclear acceptance criteria: leads to “extra” features or heavy refactors.
- Hidden global state: shared configs (e.g., `globals.css`, `tailwind.config`) are easily clobbered.
- Mismatched assumptions: agents infer different stacks, libraries, or data sources.
- Silent drift: agents use outdated docs or assumptions; verify with current repo state.
- Over‑fan‑out: too many agents increases coordination cost and reduces quality.

## Learnings (from past runs)
- Schemas should be finalized early; it unblocks ingestion, API, and UI in parallel.
- Keep a single “source of truth” doc (INIT.md) and update it with merged decisions.
- Use deterministic IDs and de‑dup early; retrofitting ingestion is expensive.
- Prefer derived tables for UI speed, but keep raw events to re‑derive later.
- UI can stub with fixtures while ingestion stabilizes; avoids blocking design work.

## In‑session fan‑out (sub‑agents)
Use prompt‑driven delegation **only** when you want exploratory research or quick parallel checks.
- Ask explicitly for parallel investigations and a merged summary.
- Treat outputs as suggestions; verify before applying changes.
- There is no documented CLI flag to set sub‑agent counts; fan‑out is session‑managed.

## App‑server collaboration modes (optional)
If building tooling around Codex, the app‑server protocol exposes collaboration mode presets. Use this only if you are integrating at the protocol layer; the CLI itself does not expose a direct “collaboration mode” flag.

## Local verification (this repo)
Verified CLI options locally via:
- `codex --help`
- `codex exec --help`
- `codex exec resume --help`
- `codex app-server --help`

Shadcn/ui install + chart notes: `docs/shadcn.md`.

## Safety + hygiene
- Keep each agent’s scope small and non‑overlapping.
- Avoid editing the same file in parallel unless you merge manually.
- Prefer read‑only or workspace‑write sandboxing unless explicitly needed.
- Always summarize and reconcile results in the orchestrator session.
