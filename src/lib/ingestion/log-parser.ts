import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { stripAnsi } from './ansi-strip'
import { parseFunctionCall, type FunctionCallEvent } from './parsers/function-call'
import { parseToolCall, type ToolCallEvent } from './parsers/tool-call'
import { parseBackgroundEvent, type BackgroundEvent } from './parsers/background-event'

export type ToolCallStatus = 'ok' | 'failed' | 'unknown'

export interface ToolCallRecord {
  tool_name: string
  command: string | null
  status: ToolCallStatus
  start_ts: number
  end_ts: number | null
  duration_ms: number | null
  exit_code: number | null
  error: string | null
  stdout_bytes: number | null
  stderr_bytes: number | null
  source_file: string
  source_line: number
  correlation_key: string
  dedup_key: string
}

export interface ParseError {
  line: number
  message: string
  raw: string
}

export interface LogParseResult {
  toolCalls: ToolCallRecord[]
  newOffset: number
  errors: ParseError[]
}

export async function parseLogFile(logPath: string, fromOffset = 0): Promise<LogParseResult> {
  const resolvedPath = path.resolve(logPath)
  const stats = await fs.promises.stat(resolvedPath).catch(() => null)
  if (!stats) {
    return {
      toolCalls: [],
      newOffset: 0,
      errors: [
        {
          line: 0,
          message: 'Log file not found',
          raw: resolvedPath,
        },
      ],
    }
  }

  const fileSize = stats.size
  let offset = fromOffset
  if (offset < 0 || offset > fileSize) offset = 0

  const lineOffset = offset > 0 ? await countNewlinesBeforeOffset(resolvedPath, offset) : 0
  const { lines, bytesUsed } = await readLinesFromOffset(resolvedPath, offset)
  const newOffset = offset + bytesUsed

  const cleanLines = lines.map((line) => stripAnsi(line))
  const errors: ParseError[] = []

  const functionCalls: FunctionCallEvent[] = []
  const toolCallEvents: ToolCallEvent[] = []
  const backgroundEvents: BackgroundEvent[] = []

  let index = 0
  while (index < cleanLines.length) {
    const line = cleanLines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const ts = parseTimestamp(trimmed)
    if (ts === null) {
      index += 1
      continue
    }

    const sourceLine = lineOffset + index + 1

    const toolRes = parseToolCall(cleanLines, index, ts, sourceLine)
    if (toolRes) {
      toolCallEvents.push(toolRes.event)
      index += toolRes.consumed_lines + 1
      continue
    }

    const funcRes = parseFunctionCall(cleanLines, index, ts, sourceLine)
    if (funcRes) {
      functionCalls.push(funcRes.event)
      index += funcRes.consumed_lines + 1
      continue
    }

    const bgRes = parseBackgroundEvent(cleanLines, index, ts, sourceLine)
    if (bgRes) {
      backgroundEvents.push(bgRes.event)
      index += bgRes.consumed_lines + 1
      continue
    }

    index += 1
  }

  const toolCalls = correlateToolCalls(
    functionCalls,
    toolCallEvents,
    backgroundEvents,
    resolvedPath
  )

  return { toolCalls, newOffset, errors }
}

interface StartEvent {
  ts: number
  tool_name: string
  command: string | null
  signature: string
  source_line: number
}

interface EndEvent {
  ts: number
  tool_name: string | null
  command: string | null
  signature: string
  event_type: 'exit' | 'failure'
  exit_code: number | null
  duration_ms: number | null
  stdout_bytes: number | null
  stderr_bytes: number | null
  error: string | null
  source_line: number
}

function correlateToolCalls(
  functionCalls: FunctionCallEvent[],
  toolEvents: ToolCallEvent[],
  backgroundEvents: BackgroundEvent[],
  sourceFile: string
): ToolCallRecord[] {
  const events: Array<{ type: 'start' | 'end'; event: StartEvent | EndEvent }> = []

  for (const call of functionCalls) {
    events.push({
      type: 'start',
      event: {
        ts: call.ts,
        tool_name: call.tool_name,
        command: call.command,
        signature: call.signature,
        source_line: call.source_line,
      },
    })
  }

  for (const evt of toolEvents) {
    if (evt.event_type === 'start') {
      events.push({
        type: 'start',
        event: {
          ts: evt.ts,
          tool_name: evt.tool_name,
          command: evt.command,
          signature: evt.signature,
          source_line: evt.source_line,
        },
      })
    } else {
      events.push({
        type: 'end',
        event: {
          ts: evt.ts,
          tool_name: evt.tool_name,
          command: evt.command,
          signature: evt.signature,
          event_type: evt.event_type,
          exit_code: evt.exit_code,
          duration_ms: evt.duration_ms,
          stdout_bytes: evt.stdout_bytes,
          stderr_bytes: evt.stderr_bytes,
          error: evt.error,
          source_line: evt.source_line,
        },
      })
    }
  }

  for (const evt of backgroundEvents) {
    events.push({
      type: 'end',
      event: {
        ts: evt.ts,
        tool_name: evt.tool_name,
        command: evt.command,
        signature: evt.signature,
        event_type: 'failure',
        exit_code: evt.exit_code,
        duration_ms: null,
        stdout_bytes: null,
        stderr_bytes: null,
        error: evt.error,
        source_line: evt.source_line,
      },
    })
  }

  events.sort((a, b) => a.event.ts - b.event.ts)

  const pending: StartEvent[] = []
  const results: ToolCallRecord[] = []

  for (const entry of events) {
    if (entry.type === 'start') {
      const start = entry.event as StartEvent
      if (!shouldAddStart(pending, start)) continue
      pending.push(start)
      continue
    }

    const end = entry.event as EndEvent
    const matchIndex = findMatchingStart(pending, end)

    if (matchIndex >= 0) {
      const start = pending.splice(matchIndex, 1)[0]
      results.push(buildToolCallRecord({ start, end, sourceFile }))
    } else {
      results.push(buildToolCallRecord({ end, sourceFile }))
    }
  }

  for (const start of pending) {
    results.push(buildToolCallRecord({ start, sourceFile }))
  }

  return results
}

function shouldAddStart(pending: StartEvent[], start: StartEvent): boolean {
  const windowMs = 1000
  return !pending.some((existing) => {
    if (existing.signature !== start.signature) return false
    return Math.abs(existing.ts - start.ts) <= windowMs
  })
}

function findMatchingStart(pending: StartEvent[], end: EndEvent): number {
  const windowMs = 5 * 60 * 1000
  let bestIndex = -1
  let bestDelta = Number.POSITIVE_INFINITY
  let bestScore = -1

  for (let i = 0; i < pending.length; i += 1) {
    const start = pending[i]
    const delta = Math.abs(end.ts - start.ts)
    if (delta > windowMs) continue

    const signatureMatch = start.signature === end.signature
    const toolMatch = !!end.tool_name && start.tool_name === end.tool_name

    const score = (signatureMatch ? 2 : 0) + (toolMatch ? 1 : 0)
    if (score === 0 && bestIndex !== -1) continue

    if (score > 0) {
      if (score > bestScore || (score == bestScore && delta < bestDelta)) {
        bestIndex = i
        bestDelta = delta
        bestScore = score
      }
      continue
    }

    if (bestScore <= 0 && (bestIndex === -1 || delta < bestDelta)) {
      bestIndex = i
      bestDelta = delta
      bestScore = 0
    }
  }

  return bestIndex
}

function buildToolCallRecord({
  start,
  end,
  sourceFile,
}: {
  start?: StartEvent
  end?: EndEvent
  sourceFile: string
}): ToolCallRecord {
  const toolName = start?.tool_name ?? end?.tool_name ?? 'unknown'
  const command = start?.command ?? end?.command ?? null
  const startTs = start?.ts ?? inferStartTs(end)
  const endTs = end?.ts ?? null

  const duration = end?.duration_ms ?? (startTs !== null && endTs !== null ? endTs - startTs : null)

  const exitCode = end?.exit_code ?? null
  const error = end?.error ?? null
  const status = deriveStatus(end, exitCode)

  const sourceLine = start?.source_line ?? end?.source_line ?? 0
  const signature = start?.signature ?? end?.signature ?? toolName

  const correlationKey = hashString(`${signature}:${startTs ?? endTs ?? 0}`)
  const dedupKey = hashString(`${sourceFile}:${sourceLine}:${signature}:${startTs ?? endTs ?? 0}`)

  return {
    tool_name: toolName,
    command,
    status,
    start_ts: startTs ?? endTs ?? 0,
    end_ts: endTs,
    duration_ms: duration,
    exit_code: exitCode,
    error,
    stdout_bytes: end?.stdout_bytes ?? null,
    stderr_bytes: end?.stderr_bytes ?? null,
    source_file: sourceFile,
    source_line: sourceLine,
    correlation_key: correlationKey,
    dedup_key: dedupKey,
  }
}

function deriveStatus(end: EndEvent | undefined, exitCode: number | null): ToolCallStatus {
  if (!end) return 'unknown'
  if (end.event_type === 'failure') return 'failed'
  if (exitCode !== null && exitCode !== 0) return 'failed'
  if (end.event_type === 'exit') return 'ok'
  return 'unknown'
}

function inferStartTs(end?: EndEvent): number | null {
  if (!end) return null
  if (end.duration_ms !== null) {
    return end.ts - end.duration_ms
  }
  return end.ts
}

async function readLinesFromOffset(
  filePath: string,
  offset: number
): Promise<{ lines: string[]; bytesUsed: number }> {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const stats = await handle.stat()
    const size = stats.size
    if (offset >= size) return { lines: [], bytesUsed: 0 }

    const length = size - offset
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    const slice = buffer.subarray(0, bytesRead)

    const lastNewline = slice.lastIndexOf(10) // \n
    if (lastNewline === -1) {
      return { lines: [], bytesUsed: 0 }
    }

    const usable = slice.subarray(0, lastNewline)
    const text = usable.toString('utf8')
    const lines = text.split(/\r?\n/)
    return { lines, bytesUsed: lastNewline + 1 }
  } finally {
    await handle.close()
  }
}

async function countNewlinesBeforeOffset(filePath: string, offset: number): Promise<number> {
  if (offset <= 0) return 0
  return new Promise((resolve, reject) => {
    let count = 0
    const stream = fs.createReadStream(filePath, { start: 0, end: offset - 1 })
    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
      for (const byte of buf) {
        if (byte === 10) count += 1
      }
    })
    stream.on('error', (err) => reject(err))
    stream.on('end', () => resolve(count))
  })
}

function parseTimestamp(line: string): number | null {
  const isoMatch =
    /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)/.exec(line)
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1])
    if (!Number.isNaN(parsed)) return parsed
  }

  const match = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/.exec(line)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const ms = match[7] ? Number(match[7].padEnd(3, '0')) : 0

  const date = new Date(year, month - 1, day, hour, minute, second, ms)
  const ts = date.getTime()
  return Number.isNaN(ts) ? null : ts
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
