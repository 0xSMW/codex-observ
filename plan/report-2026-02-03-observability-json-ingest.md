# Observability JSON Ingest Research Report

## Executive Summary

This codebase ingests observability data primarily from JSON Lines (`.jsonl`) files under the Codex home directory. Session JSONL files are discovered under `~/.codex/sessions` and processed line-by-line with incremental offsets, parsing each JSON object into session metadata, turn context, response messages, and token usage events that populate database tables. The ingestion entry point is `ingestInternal` in `src/lib/ingestion/index.ts`, which orchestrates discovery, incremental reading, parsing, and insertion, and persists ingest state offsets per file. The JSONL reader handles byte offsets, line-number tracking, and JSON parse errors. Parsing logic is split across dedicated parser modules that detect line type (`type`/`kind`/`event_type`/`eventType`) and extract key fields like `session_id`, timestamps, model/provider, token usage counts, and message roles/content. A watcher subsystem identifies relevant files (all `.jsonl`, plus `history.jsonl`) for ingest scheduling, but the ingest pipeline itself only discovers session files under `sessions/`. There is also log ingestion for `codex-tui.log`, which is not JSON but is parsed separately for tool-call observability.

## Scope Reviewed

- `src/lib/ingestion/file-discovery.ts`
- `src/lib/ingestion/index.ts`
- `src/lib/ingestion/jsonl-reader.ts`
- `src/lib/ingestion/parsers/session-meta.ts`
- `src/lib/ingestion/parsers/turn-context.ts`
- `src/lib/ingestion/parsers/response-item.ts`
- `src/lib/ingestion/parsers/event-msg.ts`
- `src/lib/ingestion/parsers/helpers.ts`
- `src/lib/watcher/index.ts`

## Current Behavior Map

- Entry points
  - `ingestAll`/`ingestIncremental` call `ingestInternal` to drive ingest from disk. `ingestInternal` discovers session JSONL files, reads incremental JSONL lines, parses them, and inserts records. `codex-tui.log` is also parsed after JSONL processing. Locations: `src/lib/ingestion/index.ts:112-334`.
  - The watcher marks `.jsonl` files and `history.jsonl` as relevant and queues ingest via an injectable handler, used for live updates. Locations: `src/lib/watcher/index.ts:91-165`, `src/lib/watcher/index.ts:293-294`.

- State/data flow
  - File discovery finds JSONL files in `~/.codex/sessions` by walking directories and filtering on `.jsonl`. Locations: `src/lib/ingestion/file-discovery.ts:20-67`.
  - Incremental JSONL reading reads from byte offsets, aligns to line boundaries, JSON-parses each non-empty line, and returns parsed lines plus parse errors and offsets. Locations: `src/lib/ingestion/jsonl-reader.ts:66-142`.
  - Each JSON object is classified by `getLineType` and routed through parsers. Locations: `src/lib/ingestion/parsers/helpers.ts:24-30`, `src/lib/ingestion/index.ts:171-245`.
  - Parsed records are batched into DB inserts, and ingest state (path, byte offset, mtime) is persisted per file. Locations: `src/lib/ingestion/index.ts:248-257`.

- External dependencies
  - Filesystem access to `~/.codex/sessions/*.jsonl` and `~/.codex/log/codex-tui.log`. Locations: `src/lib/ingestion/file-discovery.ts:52-76`, `src/lib/ingestion/index.ts:273-301`.

- Error handling/cancellation
  - JSON parsing errors are collected with line numbers and raw content fragments. Locations: `src/lib/ingestion/jsonl-reader.ts:117-126`.
  - File stat/read errors are captured per file with a synthetic line `0`. Locations: `src/lib/ingestion/index.ts:129-152`.

## Key Findings (ranked)

1. **Session JSONL discovery is rooted at `~/.codex/sessions` and filters on `.jsonl`.**
   - Location(s): `src/lib/ingestion/file-discovery.ts:52-67`, `src/lib/ingestion/file-discovery.ts:31-47`.
   - Observation: The ingest pipeline only enumerates JSONL files inside the `sessions` folder and ignores other JSONL locations unless separately wired.
   - Relevance: These are the primary source JSON files for observability session data.

2. **JSONL loading is incremental, offset-aware, and line-numbered.**
   - Location(s): `src/lib/ingestion/jsonl-reader.ts:66-142`.
   - Observation: The reader computes line bases from byte offsets, skips partial lines, parses each JSON line with `JSON.parse`, and reports parse errors with line numbers.
   - Relevance: This is the core load path for source JSON ingest and explains how partial writes/updates are handled.

3. **Parsing logic is driven by `type`/`kind`/`event_type`/`eventType` and maps to session/meta, turn context, response items, and token counts.**
   - Location(s): `src/lib/ingestion/parsers/helpers.ts:24-30`, `src/lib/ingestion/index.ts:171-245`.
   - Observation: Each line’s JSON object is routed to one of the parsers based on a lowercased type token.
   - Relevance: Identifies where line classification happens and how the ingest decides which records to emit.

4. **Session meta parser extracts key session fields (cwd, originator, CLI version, model provider, git info).**
   - Location(s): `src/lib/ingestion/parsers/session-meta.ts:23-107`.
   - Observation: `parseSessionMeta` pulls `session_id`, `ts`, `cwd`, `originator`, `cli_version`, `model_provider`, and optional git branch/commit into the session record.
   - Relevance: These fields are foundational for observability session summaries and attribution.

5. **Response item parser captures role + optional content, gated by an env var.**
   - Location(s): `src/lib/ingestion/parsers/response-item.ts:69-135`.
   - Observation: The parser only persists message content when `CODEX_OBSERV_STORE_CONTENT` is enabled, otherwise stores `null` content while still recording role/time/session.
   - Relevance: Defines what user/assistant message details are preserved in observability data.

6. **Token usage parser (`event_msg` + `token_count`) pulls usage fields from multiple payload shapes.**
   - Location(s): `src/lib/ingestion/parsers/event-msg.ts:41-139`.
   - Observation: It normalizes token counts from `usage`, `info.last_token_usage`, `info.total_token_usage`, etc., and computes totals when needed.
   - Relevance: Explains where usage metrics displayed in observability charts are sourced.

7. **Turn context parser supplies model/provider updates tied to sessions.**
   - Location(s): `src/lib/ingestion/parsers/turn-context.ts:16-58`.
   - Observation: Extracts model and provider from several possible fields and updates per-session context.
   - Relevance: Model attribution is used across session and usage views.

8. **Watcher treats all `.jsonl` plus `history.jsonl` as ingest-relevant, though ingest only discovers `sessions/*.jsonl`.**
   - Location(s): `src/lib/watcher/index.ts:91-130`, `src/lib/ingestion/index.ts:112-245`.
   - Observation: The watcher queues any `.jsonl` path, but `ingestInternal` loads only `~/.codex/sessions` JSONL files.
   - Relevance: If `history.jsonl` is expected to be ingested, it is not wired in the current ingest path.

## Candidate Change Points (behavior must remain identical)

- JSONL discovery: `src/lib/ingestion/file-discovery.ts:20-67`
- JSONL reader and parse error tracking: `src/lib/ingestion/jsonl-reader.ts:66-142`
- Line-type detection and per-type parsing: `src/lib/ingestion/parsers/helpers.ts:24-67`, `src/lib/ingestion/parsers/*.ts`
- Ingest orchestration and DB inserts: `src/lib/ingestion/index.ts:112-334`

## Risks and Guardrails

- Offsets and line-number math are sensitive to file truncation; `readJsonlIncremental` resets when file size shrinks. Locations: `src/lib/ingestion/jsonl-reader.ts:71-83`.
- Message content is gated by environment; downstream consumers should handle `null` content. Locations: `src/lib/ingestion/parsers/response-item.ts:97-109`.

## Open Questions/Assumptions

- `history.jsonl` is treated as a relevant file by the watcher, but is not currently read by `ingestInternal`. If it is supposed to be ingested, an additional load path may exist elsewhere or is unimplemented.
- This report assumes observability data comes from the Codex CLI `.codex` directory; no other JSON sources were found in the ingest pipeline.

## References

- src/lib/ingestion/file-discovery.ts
- src/lib/ingestion/index.ts
- src/lib/ingestion/jsonl-reader.ts
- src/lib/ingestion/parsers/helpers.ts
- src/lib/ingestion/parsers/session-meta.ts
- src/lib/ingestion/parsers/turn-context.ts
- src/lib/ingestion/parsers/response-item.ts
- src/lib/ingestion/parsers/event-msg.ts
- src/lib/watcher/index.ts
