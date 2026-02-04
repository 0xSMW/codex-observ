import fs from 'fs'
import os from 'os'
import path from 'path'
import { stripAnsi } from './ansi-strip'
import { generateDedupKey } from './dedup'
import type { DesktopLogEventRecord } from '../db/queries/desktop-log-events'
import type { WorktreeEventRecord } from '../db/queries/worktree-events'
import type { AutomationEventRecord } from '../db/queries/automation-events'

export interface DesktopLogParseError {
  line: number
  message: string
  raw: string
}

export interface DesktopLogParseResult {
  events: DesktopLogEventRecord[]
  worktreeEvents: WorktreeEventRecord[]
  automationEvents: AutomationEventRecord[]
  newOffset: number
  errors: DesktopLogParseError[]
}

type FileMeta = {
  appSessionId: string | null
  processId: number | null
  threadId: number | null
  instanceId: number | null
  segmentIndex: number | null
}

const RECORD_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s/
const HEADER_MATCH =
  /^(?<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(?<level>[a-zA-Z]+)\s+(?<rest>.*)$/

const SAFE_COMPONENTS = new Set([
  'sparkle',
  'git',
  'git-repo-watcher',
  'desktop-notifications',
  'electron-message-handler',
  'app-server',
  'main',
  'worker',
  'ipc',
  'router',
])

const SAFE_MESSAGE_PATTERNS = [
  /codex_app_/i,
  /launching app/i,
  /sparkle/i,
  /git\b/i,
  /worktree/i,
  /automation/i,
  /desktop notification/i,
  /app server/i,
  /skills?\//i,
]

const SENSITIVE_PATTERNS = [/^\s*user:/i, /^\s*assistant:/i, /system prompt/i, /\bprompt\b/i]

export async function parseDesktopLogFile(
  filePath: string,
  fromOffset = 0
): Promise<DesktopLogParseResult> {
  const resolvedPath = path.resolve(filePath)
  const stats = await fs.promises.stat(resolvedPath).catch(() => null)
  if (!stats) {
    return {
      events: [],
      worktreeEvents: [],
      automationEvents: [],
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
  const errors: DesktopLogParseError[] = []

  const meta = parseLogFileName(resolvedPath)
  const events: DesktopLogEventRecord[] = []
  const worktreeEvents: WorktreeEventRecord[] = []
  const automationEvents: AutomationEventRecord[] = []

  let currentLines: string[] = []
  let currentLineNumber = 0

  const flushRecord = () => {
    if (currentLines.length === 0) return
    const record = parseLogRecord(currentLines)
    if (!record) {
      errors.push({
        line: currentLineNumber,
        message: 'Failed to parse log record',
        raw: currentLines[0] ?? '',
      })
      currentLines = []
      currentLineNumber = 0
      return
    }

    const shouldStore = shouldStoreLog(record.level, record.component, record.message)
    if (!shouldStore) {
      currentLines = []
      currentLineNumber = 0
      return
    }

    const sanitizedMessage = sanitizeLogText(record.message)
    const sanitizedPayload = record.payloadText ? sanitizeLogText(record.payloadText) : null
    const dedupPayload = {
      ts: record.ts,
      level: record.level,
      component: record.component,
      message: sanitizedMessage,
      payload: sanitizedPayload,
    }
    const dedupKey = generateDedupKey(resolvedPath, currentLineNumber, dedupPayload)
    const id = dedupKey

    const logEvent: DesktopLogEventRecord = {
      id,
      app_session_id: meta.appSessionId,
      ts: record.ts,
      level: record.level,
      component: record.component,
      message: sanitizedMessage,
      payload_text: sanitizedPayload,
      process_id: meta.processId,
      thread_id: meta.threadId,
      instance_id: meta.instanceId,
      segment_index: meta.segmentIndex,
      file_path: resolvedPath,
      line_number: currentLineNumber,
      dedup_key: dedupKey,
      created_at: Date.now(),
    }

    events.push(logEvent)

    const worktreeEvent = extractWorktreeEvent({
      logId: id,
      ts: record.ts,
      level: record.level,
      component: record.component,
      message: record.message,
      appSessionId: meta.appSessionId,
    })
    if (worktreeEvent) {
      worktreeEvents.push(worktreeEvent)
    }

    const automationEvent = extractAutomationEvent({
      logId: id,
      ts: record.ts,
      level: record.level,
      component: record.component,
      message: record.message,
      appSessionId: meta.appSessionId,
      defaultThreadId: meta.threadId,
    })
    if (automationEvent) {
      automationEvents.push(automationEvent)
    }

    currentLines = []
    currentLineNumber = 0
  }

  for (let index = 0; index < cleanLines.length; index += 1) {
    const line = cleanLines[index]
    const sourceLine = lineOffset + index + 1

    if (RECORD_START.test(line)) {
      flushRecord()
      currentLines = [line]
      currentLineNumber = sourceLine
      continue
    }

    if (currentLines.length > 0) {
      currentLines.push(line)
    }
  }

  flushRecord()

  return { events, worktreeEvents, automationEvents, newOffset, errors }
}

function parseLogFileName(filePath: string): FileMeta {
  const name = path.basename(filePath)
  const match = /^codex-desktop-([a-f0-9-]+)-(\d+)-t(\d+)-i(\d+)-\d{6}-(\d+)\.log$/i.exec(name)
  if (!match) {
    return {
      appSessionId: null,
      processId: null,
      threadId: null,
      instanceId: null,
      segmentIndex: null,
    }
  }

  return {
    appSessionId: match[1] ?? null,
    processId: toNumber(match[2]),
    threadId: toNumber(match[3]),
    instanceId: toNumber(match[4]),
    segmentIndex: toNumber(match[5]),
  }
}

function parseLogRecord(lines: string[]): {
  ts: number
  level: string | null
  component: string | null
  message: string
  payloadText: string | null
} | null {
  if (lines.length === 0) return null
  const headerMatch = HEADER_MATCH.exec(lines[0])
  if (!headerMatch?.groups) return null

  const tsRaw = headerMatch.groups.ts
  const ts = Date.parse(tsRaw)
  if (!Number.isFinite(ts)) return null

  const level = headerMatch.groups.level?.toLowerCase() ?? null
  let rest = headerMatch.groups.rest ?? ''
  rest = rest.trim()

  let component: string | null = null
  if (rest.startsWith('[')) {
    const end = rest.indexOf(']')
    if (end > 0) {
      component = rest.slice(1, end)
      rest = rest.slice(end + 1).trim()
    }
  }

  let message = rest
  if (lines.length > 1) {
    message = `${message}\n${lines.slice(1).join('\n')}`
  }

  let payloadText: string | null = null
  const payloadMatch = /^(.*?)(\s\{[\s\S]*)$/.exec(message)
  if (payloadMatch) {
    message = payloadMatch[1]?.trim() ?? message.trim()
    payloadText = payloadMatch[2]?.trim() ?? null
  }

  return { ts, level, component, message, payloadText }
}

function shouldStoreLog(level: string | null, component: string | null, message: string): boolean {
  const lower = message.toLowerCase()
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(lower))) {
    return false
  }

  if (component) {
    const comp = component.toLowerCase()
    if (SAFE_COMPONENTS.has(comp)) return true
  }

  if (SAFE_MESSAGE_PATTERNS.some((pattern) => pattern.test(lower))) {
    return true
  }

  if (level && ['warn', 'warning', 'error'].includes(level)) {
    return true
  }

  return false
}

function sanitizeLogText(text: string): string {
  let result = text
  const homeDir = os.homedir()
  if (homeDir) {
    result = result.replace(new RegExp(escapeRegex(homeDir), 'g'), '~')
  }

  result = result.replace(/\/Users\/[^/\s]+/g, '/Users/[redacted]')
  result = result.replace(/\/home\/[^/\s]+/g, '/home/[redacted]')
  result = result.replace(/[A-Za-z]:\\Users\\[^\\\s]+/g, 'C:\\Users\\[redacted]')
  result = result.replace(/[A-Za-z]:\/Users\/[^/\s]+/g, 'C:/Users/[redacted]')
  result = result.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted]')

  return result
}

function extractWorktreeEvent({
  logId,
  ts,
  level,
  component,
  message,
  appSessionId,
}: {
  logId: string
  ts: number
  level: string | null
  component: string | null
  message: string
  appSessionId: string | null
}): WorktreeEventRecord | null {
  const lower = message.toLowerCase()
  const comp = component?.toLowerCase() ?? ''
  if (!lower.includes('worktree') && !comp.includes('git')) {
    return null
  }

  let action: 'created' | 'archived' | 'error' | null = null
  const pathValue = extractPathFromText(message)
  const pathLower = pathValue?.toLowerCase() ?? ''
  const isCodexWorktree =
    pathLower.includes('/.codex/worktrees/') || pathLower.includes('\\.codex\\worktrees\\')

  if (/starting git repo watcher\b/.test(lower) && isCodexWorktree) {
    action = 'created'
  } else if (/(create|created|creating)\b/.test(lower)) {
    action = 'created'
  } else if (/(delete|deleted|remove|removed)\b/.test(lower)) {
    action = 'archived'
  } else if (/(error|failed|fatal|exception)\b/.test(lower)) {
    action = 'error'
  }

  if (!action) {
    if (level && ['warn', 'warning', 'error'].includes(level)) {
      action = 'error'
    } else {
      return null
    }
  }

  const branch = extractBranchFromText(message)
  const error = action === 'error' ? sanitizeLogText(message) : null
  const status = action === 'error' ? 'failed' : 'ok'

  const payload = {
    ts,
    action,
    pathValue,
    branch,
  }
  const dedupKey = generateDedupKey(logId, 0, payload)

  return {
    id: dedupKey,
    ts,
    action,
    worktree_path: pathValue ? sanitizeLogText(pathValue) : null,
    repo_root: pathValue ? sanitizeLogText(pathValue) : null,
    branch,
    status,
    error,
    app_session_id: appSessionId,
    source_log_id: logId,
    dedup_key: dedupKey,
  }
}

function extractAutomationEvent({
  logId,
  ts,
  level,
  component,
  message,
  appSessionId,
  defaultThreadId,
}: {
  logId: string
  ts: number
  level: string | null
  component: string | null
  message: string
  appSessionId: string | null
  defaultThreadId: number | null
}): AutomationEventRecord | null {
  const lower = message.toLowerCase()
  const comp = component?.toLowerCase() ?? ''
  if (!lower.includes('automation') && !comp.includes('automation')) {
    return null
  }

  let action: 'queued' | 'completed' | 'failed' | null = null
  if (/(queued|enqueue|enqueued)\b/.test(lower)) action = 'queued'
  else if (/(completed|complete|finished|succeeded)\b/.test(lower)) action = 'completed'
  else if (/(failed|error|exception)\b/.test(lower)) action = 'failed'

  if (!action) {
    if (level && ['warn', 'warning', 'error'].includes(level)) {
      action = 'failed'
    } else {
      return null
    }
  }

  const threadId = extractThreadId(message, defaultThreadId)
  const status = action === 'failed' ? 'failed' : 'ok'
  const error = action === 'failed' ? sanitizeLogText(message) : null

  const payload = { ts, action, threadId }
  const dedupKey = generateDedupKey(logId, 0, payload)

  return {
    id: dedupKey,
    ts,
    action,
    thread_id: threadId,
    status,
    error,
    app_session_id: appSessionId,
    source_log_id: logId,
    dedup_key: dedupKey,
  }
}

function extractPathFromText(text: string): string | null {
  const quotedUnix = text.match(/["'](\/[^"']+)["']/)
  if (quotedUnix) return quotedUnix[1]
  const quotedWin = text.match(/["']([A-Za-z]:\\[^"']+)["']/)
  if (quotedWin) return quotedWin[1]
  const unix = text.match(/(\/[^\s'"`]+)/)
  if (unix) return unix[1]
  const win = text.match(/([A-Za-z]:\\[^\s'"`]+)/)
  if (win) return win[1]
  return null
}

function extractBranchFromText(text: string): string | null {
  const match = text.match(/branch[:=\s]+([A-Za-z0-9._/-]+)/i)
  if (!match) return null
  return match[1]
}

function extractThreadId(text: string, fallback: number | null): string | null {
  const match = text.match(/thread(?:_id)?[:=\s]+([A-Za-z0-9-]+)/i)
  if (match) return match[1]
  if (fallback !== null && fallback !== undefined) return String(fallback)
  return null
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
