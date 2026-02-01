import crypto from 'crypto'

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null'
  }

  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return JSON.stringify(value)
  }

  if (type === 'bigint') {
    return JSON.stringify(value.toString())
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stableStringify(item)).join(',')
    return `[${items}]`
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }

  if (Buffer.isBuffer(value)) {
    return JSON.stringify(value.toString('base64'))
  }

  if (type === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v !== 'function')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const body = entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(',')
    return `{${body}}`
  }

  return JSON.stringify(String(value))
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

export function hashPayload(payload: unknown, truncateTo = 24): string {
  const stable = stableStringify(payload)
  return sha256Hex(stable).slice(0, truncateTo)
}

export function generateDedupKey(
  sourceFile: string,
  sourceLine: number,
  payload: unknown,
  truncateTo = 24
): string {
  const payloadHash = hashPayload(payload, truncateTo)
  const combined = `${sourceFile}:${sourceLine}:${payloadHash}`
  return sha256Hex(combined).slice(0, truncateTo)
}

export function generateRecordId(
  sourceFile: string,
  sourceLine: number,
  payload: unknown,
  truncateTo = 24
): string {
  return generateDedupKey(sourceFile, sourceLine, payload, truncateTo)
}
