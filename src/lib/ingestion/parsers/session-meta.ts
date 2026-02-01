import { generateDedupKey } from '../dedup'
import type { SessionRecord } from '../../db/queries/sessions'
import { coerceString, getLineType, getSessionId, getTimestamp } from './helpers'
import type { ParseContext } from './types'

function pickMeta(obj: Record<string, unknown>): Record<string, unknown> {
  const candidates = [obj.session_meta, obj.meta, obj.session, obj.payload]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate as Record<string, unknown>
    }
  }

  return obj
}

export interface ParsedSessionMeta {
  record: SessionRecord
  sessionId: string
}

export function parseSessionMeta(json: unknown, context: ParseContext): ParsedSessionMeta | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>
  const type = getLineType(obj)
  if (!type || !type.includes('session_meta')) {
    return null
  }

  const meta = pickMeta(obj)
  const sessionIdRaw = getSessionId(meta) ?? getSessionId(obj)
  const ts = getTimestamp(meta) ?? getTimestamp(obj) ?? context.fallbackTs ?? Date.now()

  const cwd = coerceString(
    (meta as { cwd?: unknown }).cwd ??
      (meta as { working_dir?: unknown }).working_dir ??
      (meta as { workingDirectory?: unknown }).workingDirectory ??
      (meta as { project?: unknown }).project ??
      (meta as { repo?: unknown }).repo
  )

  const originator = coerceString(
    (meta as { originator?: unknown }).originator ??
      (meta as { user?: unknown }).user ??
      (meta as { actor?: unknown }).actor ??
      (meta as { owner?: unknown }).owner
  )

  const cli_version = coerceString(
    (meta as { cli_version?: unknown }).cli_version ??
      (meta as { cliVersion?: unknown }).cliVersion ??
      (meta as { version?: unknown }).version ??
      (meta as { client_version?: unknown }).client_version ??
      (meta as { clientVersion?: unknown }).clientVersion
  )

  const model_provider = coerceString(
    (meta as { model_provider?: unknown }).model_provider ??
      (meta as { modelProvider?: unknown }).modelProvider ??
      (meta as { provider?: unknown }).provider
  )

  const git = (meta as { git?: unknown }).git
  const git_branch = coerceString(
    (meta as { git_branch?: unknown }).git_branch ??
      (meta as { gitBranch?: unknown }).gitBranch ??
      (git && (git as { branch?: unknown }).branch)
  )

  const git_commit = coerceString(
    (meta as { git_commit?: unknown }).git_commit ??
      (meta as { gitCommit?: unknown }).gitCommit ??
      (git && ((git as { commit?: unknown }).commit ?? (git as { sha?: unknown }).sha))
  )

  const payloadForDedup = {
    sessionId: sessionIdRaw,
    ts,
    cwd,
    originator,
    cli_version,
    model_provider,
    git_branch,
    git_commit,
  }

  const dedup_key = generateDedupKey(context.filePath, context.lineNumber, payloadForDedup)

  const id = sessionIdRaw ?? dedup_key

  const record: SessionRecord = {
    id,
    ts,
    cwd,
    originator,
    cli_version,
    model_provider,
    git_branch,
    git_commit,
    source_file: context.filePath,
    source_line: context.lineNumber,
    dedup_key,
  }

  return { record, sessionId: id }
}
