export function parseListParam(params: URLSearchParams, keys: string[]): string[] {
  for (const key of keys) {
    const raw = params.get(key)
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    }
  }
  return []
}

export function parseSearchParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const raw = params.get(key)
    if (raw && raw.trim()) {
      return raw.trim()
    }
  }
  return null
}

export function parseNumberParam(params: URLSearchParams, keys: string[]): number | null {
  const raw = parseSearchParam(params, keys)
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export function parseBoolParam(params: URLSearchParams, keys: string[]): boolean | null {
  for (const key of keys) {
    const raw = params.get(key)
    if (raw != null && raw !== '') {
      const lower = raw.toLowerCase().trim()
      if (lower === 'true' || lower === '1' || lower === 'yes') return true
      if (lower === 'false' || lower === '0' || lower === 'no') return false
      return null
    }
  }
  return null
}
