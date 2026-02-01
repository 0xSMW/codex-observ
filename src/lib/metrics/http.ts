import { NextResponse } from 'next/server'

export const DEFAULT_HEADERS: HeadersInit = {
  'Cache-Control': 'no-store, max-age=0',
}

export function jsonOk(data: unknown, init: ResponseInit = {}): NextResponse {
  const headers = { ...DEFAULT_HEADERS, ...(init.headers ?? {}) }
  return NextResponse.json(data, { ...init, headers })
}

export function jsonError(
  message: string,
  code: string,
  status = 400,
  init: ResponseInit = {}
): NextResponse {
  const headers = { ...DEFAULT_HEADERS, ...(init.headers ?? {}) }
  return NextResponse.json({ error: message, code }, { status, ...init, headers })
}
