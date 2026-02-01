import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Db } from '../db'
import { getDb } from '../db'
import { getIngestState, setIngestState } from '../db/queries/ingest-state'
import { insertSession, type SessionRecord } from '../db/queries/sessions'
import { insertMessage, type MessageRecord } from '../db/queries/messages'
import { insertModelCall, type ModelCallRecord } from '../db/queries/model-calls'
import { discoverSessionFiles } from './file-discovery'
import { readJsonlIncremental } from './jsonl-reader'
import { parseLogFile } from './log-parser'
import { parseSessionMeta } from './parsers/session-meta'
import { parseResponseItem } from './parsers/response-item'
import { parseEventMsg } from './parsers/event-msg'
import { parseTurnContext } from './parsers/turn-context'
import type { SessionContextUpdate } from './parsers/types'
import { insertToolCalls } from '../db/queries/tool-calls'

export interface IngestError {
  file: string
  line: number
  error: string
}

export interface IngestResult {
  filesProcessed: number
  linesIngested: number
  errors: IngestError[]
  durationMs: number
}

export interface IngestProgress {
  file: string
  fileIndex: number
  fileCount: number
  linesRead: number
  newOffset: number
}

interface IngestOptions {
  onProgress?: (progress: IngestProgress) => void
}

const DEFAULT_CODEX_HOME = path.join(os.homedir(), '.codex')

function resolveCodexHome(codexHome?: string): string {
  return (
    codexHome || process.env.CODEX_OBSERV_CODEX_HOME || process.env.CODEX_HOME || DEFAULT_CODEX_HOME
  )
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) {
    return []
  }
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

function insertBatched<T extends { source_line: number }>(
  db: Db,
  records: T[],
  insertFn: (db: Db, record: T) => boolean,
  errors: IngestError[],
  filePath: string
): void {
  if (records.length === 0) {
    return
  }

  const chunks = chunkArray(records, 100)
  const transaction = db.transaction((batch: T[]) => {
    for (const record of batch) {
      try {
        insertFn(db, record)
      } catch (error) {
        errors.push({
          file: filePath,
          line: record.source_line,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  })

  for (const batch of chunks) {
    transaction(batch)
  }
}

function updateSessionContext(
  contextBySession: Map<string, SessionContextUpdate>,
  update: SessionContextUpdate
): void {
  const existing = contextBySession.get(update.sessionId) ?? { sessionId: update.sessionId }
  contextBySession.set(update.sessionId, {
    sessionId: update.sessionId,
    model: update.model ?? existing.model,
    modelProvider: update.modelProvider ?? existing.modelProvider,
  })
}

async function ingestInternal(
  codexHome: string,
  incremental: boolean,
  options?: IngestOptions
): Promise<IngestResult> {
  const startTime = Date.now()
  const db = getDb()
  const files = await discoverSessionFiles(codexHome)

  let filesProcessed = 0
  let linesIngested = 0
  const errors: IngestError[] = []

  for (let index = 0; index < files.length; index += 1) {
    const filePath = files[index]
    let stat: fs.Stats | null = null

    try {
      stat = await fs.promises.stat(filePath)
    } catch (error) {
      errors.push({
        file: filePath,
        line: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    const previousState = incremental ? getIngestState(db, filePath) : null
    const fromOffset = incremental && previousState ? previousState.byte_offset : 0

    let readResult
    try {
      readResult = await readJsonlIncremental(filePath, fromOffset)
    } catch (error) {
      errors.push({
        file: filePath,
        line: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    for (const parseError of readResult.errors) {
      errors.push({
        file: filePath,
        line: parseError.line,
        error: parseError.error,
      })
    }

    const sessions: SessionRecord[] = []
    const messages: MessageRecord[] = []
    const modelCalls: ModelCallRecord[] = []

    const contextBySession = new Map<string, SessionContextUpdate>()
    let currentSessionId: string | null = null

    for (const line of readResult.lines) {
      const baseContext = {
        filePath,
        lineNumber: line.lineNumber,
        fallbackTs: stat.mtimeMs,
        sessionId: currentSessionId ?? undefined,
        model: currentSessionId
          ? (contextBySession.get(currentSessionId)?.model ?? undefined)
          : undefined,
        modelProvider: currentSessionId
          ? (contextBySession.get(currentSessionId)?.modelProvider ?? undefined)
          : undefined,
      }

      const sessionParsed = parseSessionMeta(line.json, baseContext)
      if (sessionParsed) {
        sessions.push(sessionParsed.record)
        currentSessionId = sessionParsed.sessionId
        updateSessionContext(contextBySession, {
          sessionId: sessionParsed.sessionId,
          modelProvider: sessionParsed.record.model_provider ?? undefined,
        })
        continue
      }

      const contextUpdate = parseTurnContext(line.json, baseContext)
      if (contextUpdate) {
        updateSessionContext(contextBySession, contextUpdate)
        currentSessionId = contextUpdate.sessionId
        continue
      }

      const message = parseResponseItem(line.json, baseContext)
      if (message) {
        messages.push(message)
        continue
      }

      const modelCall = parseEventMsg(line.json, baseContext)
      if (modelCall) {
        modelCalls.push(modelCall)
      }
    }

    insertBatched(db, sessions, insertSession, errors, filePath)
    insertBatched(db, messages, insertMessage, errors, filePath)
    insertBatched(db, modelCalls, insertModelCall, errors, filePath)

    setIngestState(db, {
      path: filePath,
      byte_offset: readResult.newOffset,
      mtime_ms: stat.mtimeMs,
    })

    filesProcessed += 1
    linesIngested += readResult.lines.length

    if (options?.onProgress) {
      options.onProgress({
        file: filePath,
        fileIndex: index + 1,
        fileCount: files.length,
        linesRead: readResult.linesRead,
        newOffset: readResult.newOffset,
      })
    }
  }

  const logPath = path.join(codexHome, 'log', 'codex-tui.log')
  try {
    const stat = await fs.promises.stat(logPath)
    const previousState = incremental ? getIngestState(db, logPath) : null
    const fromOffset = incremental && previousState ? previousState.byte_offset : 0

    const logResult = await parseLogFile(logPath, fromOffset)

    for (const parseError of logResult.errors) {
      errors.push({
        file: logPath,
        line: parseError.line,
        error: parseError.message,
      })
    }

    if (logResult.toolCalls.length > 0) {
      insertToolCalls(db, logResult.toolCalls)
    }

    setIngestState(db, {
      path: logPath,
      byte_offset: logResult.newOffset,
      mtime_ms: stat.mtimeMs,
    })

    filesProcessed += 1
    linesIngested += logResult.toolCalls.length
  } catch (error) {
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      errors.push({
        file: logPath,
        line: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    filesProcessed,
    linesIngested,
    errors,
    durationMs: Date.now() - startTime,
  }
}

export async function ingestAll(
  codexHome?: string,
  options?: IngestOptions
): Promise<IngestResult> {
  return ingestInternal(resolveCodexHome(codexHome), false, options)
}

export async function ingestIncremental(
  codexHome?: string,
  options?: IngestOptions
): Promise<IngestResult> {
  return ingestInternal(resolveCodexHome(codexHome), true, options)
}
