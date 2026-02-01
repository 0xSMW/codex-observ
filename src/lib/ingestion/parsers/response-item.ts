import { generateDedupKey } from '../dedup'
import type { MessageRecord, MessageRole } from '../../db/queries/messages'
import { coerceString, getLineType, getSessionId, getTimestamp } from './helpers'
import type { ParseContext } from './types'

function extractContent(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const entry of value) {
      if (typeof entry === 'string') {
        parts.push(entry)
        continue
      }
      if (entry && typeof entry === 'object') {
        const text = (entry as { text?: unknown }).text
        if (typeof text === 'string') {
          parts.push(text)
          continue
        }
        if (text && typeof text === 'object') {
          const inner = (text as { value?: unknown }).value
          if (typeof inner === 'string') {
            parts.push(inner)
            continue
          }
        }
        const content = (entry as { content?: unknown }).content
        if (typeof content === 'string') {
          parts.push(content)
        }
      }
    }
    if (parts.length > 0) {
      return parts.join(' ')
    }
  }

  if (value && typeof value === 'object') {
    const text = (value as { text?: unknown }).text
    if (typeof text === 'string') {
      return text
    }
    if (text && typeof text === 'object') {
      const inner = (text as { value?: unknown }).value
      if (typeof inner === 'string') {
        return inner
      }
    }
  }

  return null
}

function normalizeRole(role: string | null): MessageRole | null {
  if (!role) {
    return null
  }
  const lowered = role.toLowerCase()
  if (lowered === 'user' || lowered === 'assistant' || lowered === 'system') {
    return lowered
  }
  return null
}

export function parseResponseItem(json: unknown, context: ParseContext): MessageRecord | null {
  if (!json || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>
  const type = getLineType(obj)
  if (!type || !type.includes('response_item')) {
    return null
  }

  const item =
    obj.item && typeof obj.item === 'object' ? (obj.item as Record<string, unknown>) : obj

  const role = normalizeRole(coerceString(item.role ?? obj.role))
  if (!role) {
    return null
  }

  const sessionId = getSessionId(item) ?? getSessionId(obj) ?? context.sessionId ?? null
  if (!sessionId) {
    return null
  }

  const ts = getTimestamp(item) ?? getTimestamp(obj) ?? context.fallbackTs ?? Date.now()

  const shouldStoreContent =
    process.env.CODEX_OBSERV_STORE_CONTENT === '1' ||
    process.env.CODEX_OBSERV_STORE_CONTENT === 'true'

  const content = shouldStoreContent ? extractContent(item.content ?? obj.content) : null

  const payloadForDedup = {
    sessionId,
    role,
    ts,
  }

  const dedup_key = generateDedupKey(context.filePath, context.lineNumber, payloadForDedup)

  const nativeId = coerceString(
    (item as { message_id?: unknown }).message_id ??
      (item as { id?: unknown }).id ??
      (obj as { message_id?: unknown }).message_id
  )

  const id = nativeId && nativeId !== sessionId ? nativeId : dedup_key

  return {
    id,
    session_id: sessionId,
    role,
    ts,
    content,
    source_file: context.filePath,
    source_line: context.lineNumber,
    dedup_key,
  }
}
