import { coerceString, getLineType, getSessionId } from './helpers'
import type { ParseContext, SessionContextUpdate } from './types'

function pickContext(obj: Record<string, unknown>): Record<string, unknown> {
  const candidates = [obj.context, obj.turn_context, obj.payload]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return candidate as Record<string, unknown>
    }
  }

  return obj
}

export function parseTurnContext(
  json: unknown,
  context: ParseContext
): SessionContextUpdate | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>
  const type = getLineType(obj)
  if (!type || !type.includes('turn_context')) {
    return null
  }

  const ctx = pickContext(obj)
  const sessionId = getSessionId(ctx) ?? getSessionId(obj) ?? context.sessionId
  if (!sessionId) {
    return null
  }

  const model = coerceString(
    (ctx as { model?: unknown }).model ??
      (ctx as { model_name?: unknown }).model_name ??
      (ctx as { modelId?: unknown }).modelId ??
      ((ctx as { model?: { name?: unknown } }).model &&
        (ctx as { model?: { name?: unknown } }).model?.name) ??
      (obj as { model?: unknown }).model
  )

  const modelProvider = coerceString(
    (ctx as { model_provider?: unknown }).model_provider ??
      (ctx as { modelProvider?: unknown }).modelProvider ??
      (ctx as { provider?: unknown }).provider ??
      ((ctx as { model?: { provider?: unknown } }).model &&
        (ctx as { model?: { provider?: unknown } }).model?.provider) ??
      (obj as { model_provider?: unknown }).model_provider
  )

  return {
    sessionId,
    model: model ?? undefined,
    modelProvider: modelProvider ?? undefined,
  }
}
