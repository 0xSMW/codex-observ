import fs from 'fs'
import readline from 'readline'

export interface ParsedJsonlLine {
  lineNumber: number
  json: unknown
  raw: string
}

export interface JsonlParseError {
  line: number
  error: string
  raw: string
}

export interface JsonlReadResult {
  lines: ParsedJsonlLine[]
  newOffset: number
  wasReset: boolean
  errors: JsonlParseError[]
  linesRead: number
  lineNumberBase: number
}

export async function countNewlinesUpTo(filePath: string, byteOffset: number): Promise<number> {
  if (byteOffset <= 0) {
    return 0
  }

  let count = 0
  const stream = fs.createReadStream(filePath, {
    start: 0,
    end: byteOffset - 1,
  })

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    for (let i = 0; i < buffer.length; i += 1) {
      if (buffer[i] === 0x0a) {
        count += 1
      }
    }
  }

  return count
}

async function isOffsetAtLineBoundary(filePath: string, byteOffset: number): Promise<boolean> {
  if (byteOffset <= 0) {
    return true
  }

  const handle = await fs.promises.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(1)
    const { bytesRead } = await handle.read(buffer, 0, 1, byteOffset - 1)
    if (bytesRead === 0) {
      return true
    }
    return buffer[0] === 0x0a
  } finally {
    await handle.close()
  }
}

export async function readJsonlIncremental(
  filePath: string,
  fromOffset: number,
  options?: { lineNumberBase?: number }
): Promise<JsonlReadResult> {
  let startOffset = Math.max(fromOffset, 0)
  let wasReset = false

  const stat = await fs.promises.stat(filePath)
  if (stat.size < startOffset) {
    startOffset = 0
    wasReset = true
  }

  const lineNumberBase =
    options?.lineNumberBase ??
    (startOffset > 0 ? await countNewlinesUpTo(filePath, startOffset) : 0)

  const skipFirstLine =
    startOffset > 0 ? !(await isOffsetAtLineBoundary(filePath, startOffset)) : false

  const stream = fs.createReadStream(filePath, {
    start: startOffset,
  })

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  })

  const lines: ParsedJsonlLine[] = []
  const errors: JsonlParseError[] = []
  let lineNumber = lineNumberBase + 1
  let linesRead = 0
  let isFirstLine = true

  for await (const rawLine of rl) {
    linesRead += 1
    if (isFirstLine && skipFirstLine) {
      isFirstLine = false
      lineNumber += 1
      continue
    }
    isFirstLine = false

    const trimmed = rawLine.trim()
    if (trimmed.length === 0) {
      lineNumber += 1
      continue
    }

    try {
      const json = JSON.parse(trimmed) as unknown
      lines.push({ lineNumber, json, raw: rawLine })
    } catch (error) {
      errors.push({
        line: lineNumber,
        error: error instanceof Error ? error.message : String(error),
        raw: rawLine.slice(0, 500),
      })
    }

    lineNumber += 1
  }

  const bytesRead = stream.bytesRead ?? 0
  const newOffset = startOffset + bytesRead

  return {
    lines,
    newOffset,
    wasReset,
    errors,
    linesRead,
    lineNumberBase,
  }
}
