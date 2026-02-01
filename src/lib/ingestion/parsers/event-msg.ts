import { generateDedupKey } from '../dedup'
import type { ModelCallRecord } from '../../db/queries/model-calls'
import { coerceNumber, coerceString, getLineType, getSessionId, getTimestamp } from './helpers'
import type { ParseContext } from './types'

function pickPayload(obj: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = [
    obj.payload,
    (obj.event as { payload?: unknown } | undefined)?.payload,
    (obj.message as { payload?: unknown } | undefined)?.payload,
  ]
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate as Record<string, unknown>
    }
  }
  return null
}

function getPayloadType(payload: Record<string, unknown>): string | null {
  const raw =
    coerceString(payload.type) ?? coerceString(payload.event_type) ?? coerceString(payload.kind)
  return raw ? raw.toLowerCase() : null
}

function readTokenValue(
  sources: (Record<string, unknown> | null | undefined)[],
  keys: string[]
): number {
  for (const source of sources) {
    if (!source) continue
    for (const key of keys) {
      if (key in source) {
        return coerceNumber(source[key], 0)
      }
    }
  }
  return 0
}

export function parseEventMsg(json: unknown, context: ParseContext): ModelCallRecord | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>
  const type = getLineType(obj)
  if (!type || !type.includes('event_msg')) {
    return null
  }

  const payload = pickPayload(obj)
  const payloadType = payload ? getPayloadType(payload) : null
  if (!payloadType || !payloadType.includes('token_count')) {
    return null
  }

  const sessionId = getSessionId(payload ?? obj) ?? getSessionId(obj) ?? context.sessionId ?? null

  if (!sessionId) {
    return null
  }

  const ts = getTimestamp(payload ?? obj) ?? getTimestamp(obj) ?? context.fallbackTs ?? Date.now()

  const usage =
    payload && typeof payload.usage === 'object' ? (payload.usage as Record<string, unknown>) : null

  const info = payload?.info as Record<string, unknown> | null | undefined
  const lastUsage = info?.last_token_usage as Record<string, unknown> | undefined
  const totalUsage = info?.total_token_usage as Record<string, unknown> | undefined

  const sources = [lastUsage, totalUsage, usage, payload, obj]

  const input_tokens = readTokenValue(sources, ['input_tokens', 'input', 'prompt_tokens'])
  const cached_input_tokens = readTokenValue(sources, [
    'cached_input_tokens',
    'cached_input',
    'cache_read_tokens',
    'cached_prompt_tokens',
  ])
  const output_tokens = readTokenValue(sources, ['output_tokens', 'output', 'completion_tokens'])
  const reasoning_tokens = readTokenValue(sources, ['reasoning_tokens', 'reasoning'])

  let total_tokens = readTokenValue(sources, ['total_tokens', 'total', 'tokens'])
  const computedTotal = input_tokens + output_tokens + reasoning_tokens
  if (total_tokens === 0 && computedTotal > 0) {
    total_tokens = computedTotal
  }

  const duration_ms = coerceNumber(
    (payload as { duration_ms?: unknown } | null)?.duration_ms ??
      (obj as { duration_ms?: unknown }).duration_ms,
    0
  )

  const model =
    coerceString(
      (payload as { model?: unknown } | null)?.model ??
        (obj as { model?: unknown }).model ??
        (obj as { model_name?: unknown }).model_name
    ) ??
    context.model ??
    null

  const payloadForDedup = {
    sessionId,
    ts,
    model,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    total_tokens,
  }

  const dedup_key = generateDedupKey(context.filePath, context.lineNumber, payloadForDedup)

  const idCandidate = coerceString(
    (payload as { id?: unknown } | null)?.id ?? (obj as { id?: unknown }).id
  )

  const id = idCandidate && idCandidate !== sessionId ? idCandidate : dedup_key

  return {
    id,
    session_id: sessionId,
    ts,
    model,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    total_tokens,
    duration_ms: duration_ms > 0 ? duration_ms : null,
    source_file: context.filePath,
    source_line: context.lineNumber,
    dedup_key,
  }
}
