import 'server-only'

import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'
import { ingestAll, ingestIncremental, type IngestResult } from '@/lib/ingestion'

export interface IngestListOptions {
  pagination: Pagination
  search?: string | null
}

export interface IngestStateItem {
  path: string
  byteOffset: number
  mtimeMs: number | null
  updatedAt: number
}

export interface IngestSummary {
  totalFiles: number
  lastUpdatedAt: number | null
}

export interface IngestListResult {
  total: number
  items: IngestStateItem[]
  summary: IngestSummary
}

export interface IngestStatus {
  status: 'idle' | 'running'
  lastRun: number | null
  lastResult: IngestResult | null
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const parsed = Number(value)
  if (Number.isFinite(parsed)) {
    return parsed
  }
  return fallback
}

/** Returns the Unix timestamp (ms) when the database was last synced from source files, or null if never. */
export function getLastSyncTime(): number | null {
  const db = getDatabase()
  if (!tableExists(db, 'ingest_state')) {
    return null
  }
  const row = db.prepare('SELECT MAX(updated_at) AS last_updated_at FROM ingest_state').get() as
    | Record<string, unknown>
    | undefined
  const val = row?.last_updated_at
  if (val === null || val === undefined) return null
  const n = typeof val === 'number' ? val : Number(val)
  return Number.isFinite(n) ? n : null
}

export function getIngestState(options: IngestListOptions): IngestListResult {
  const db = getDatabase()
  if (!tableExists(db, 'ingest_state')) {
    return {
      total: 0,
      items: [],
      summary: { totalFiles: 0, lastUpdatedAt: null },
    }
  }

  const where: string[] = []
  const params: unknown[] = []
  if (options.search) {
    where.push('path LIKE ?')
    params.push(`%${options.search}%`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS total FROM ingest_state ${whereSql}`)
    .get(...params) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const summaryRow = db
    .prepare(
      `SELECT COUNT(*) AS total_files, MAX(updated_at) AS last_updated_at
      FROM ingest_state ${whereSql}`
    )
    .get(...params) as Record<string, unknown> | undefined

  const rows = db
    .prepare(
      `SELECT path, byte_offset, mtime_ms, updated_at
      FROM ingest_state
      ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?`
    )
    .all(...params, options.pagination.limit, options.pagination.offset) as Record<
    string,
    unknown
  >[]

  const items = rows.map((row) => ({
    path: String(row.path ?? ''),
    byteOffset: toNumber(row.byte_offset),
    mtimeMs: row.mtime_ms === null ? null : toNumber(row.mtime_ms),
    updatedAt: toNumber(row.updated_at),
  }))

  return {
    total,
    items,
    summary: {
      totalFiles: toNumber(summaryRow?.total_files),
      lastUpdatedAt:
        summaryRow?.last_updated_at === null ? null : toNumber(summaryRow?.last_updated_at),
    },
  }
}

const ingestStatus: IngestStatus = {
  status: 'idle',
  lastRun: null,
  lastResult: null,
}

export function getIngestStatus(): IngestStatus {
  return { ...ingestStatus }
}

export async function runIngest(
  mode: 'full' | 'incremental' = 'incremental'
): Promise<IngestResult> {
  if (ingestStatus.status === 'running') {
    return (
      ingestStatus.lastResult ?? {
        filesProcessed: 0,
        linesIngested: 0,
        errors: [],
        durationMs: 0,
      }
    )
  }
  ingestStatus.status = 'running'
  try {
    const result = mode === 'full' ? await ingestAll() : await ingestIncremental()
    ingestStatus.lastRun = Date.now()
    ingestStatus.lastResult = result
    return result
  } finally {
    ingestStatus.status = 'idle'
  }
}
