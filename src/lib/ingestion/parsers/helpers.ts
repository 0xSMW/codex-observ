export function coerceString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return null;
}

export function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export function getLineType(value: Record<string, unknown>): string | null {
  const raw =
    coerceString(value.type) ||
    coerceString(value.kind) ||
    coerceString((value as { event_type?: unknown }).event_type) ||
    coerceString((value as { eventType?: unknown }).eventType);
  return raw ? raw.toLowerCase() : null;
}

export function getTimestamp(value: Record<string, unknown>): number | null {
  const candidate =
    value.ts ??
    value.timestamp ??
    (value as { time?: unknown }).time ??
    (value as { created_at?: unknown }).created_at ??
    (value as { createdAt?: unknown }).createdAt;

  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === "string") {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const asNum = Number(candidate);
    if (Number.isFinite(asNum)) {
      return asNum;
    }
  }

  return null;
}

export function getSessionId(value: Record<string, unknown>): string | null {
  const candidate =
    value.session_id ??
    (value as { sessionId?: unknown }).sessionId ??
    (value as { session?: { id?: unknown } }).session?.id ??
    (value as { session?: { session_id?: unknown } }).session?.session_id ??
    value.id;

  return coerceString(candidate);
}
