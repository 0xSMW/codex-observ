import 'server-only'

import path from 'node:path'
import os from 'node:os'
import { performance } from 'node:perf_hooks'

import { FileWatcher } from './file-watcher'
import { debounce } from './debounce'
import { getPerformanceSnapshot, recordTiming } from '@/lib/performance/profiler'
import type {
  WatcherEvent,
  WatcherStatus,
  FileChangePayload,
  IngestPayload,
  MetricsPayload,
} from './events'

export type IngestHandler = (paths: string[]) => Promise<unknown>

interface WatcherState {
  running: boolean
  codexHome: string
  watcher: FileWatcher | null
  subscribers: Set<(event: WatcherEvent) => void>
  lastEvent: Date | null
  errors: string[]
  ingestHandler: IngestHandler
  ingestQueue: Set<string>
  ingestRunning: boolean
  pendingFlush: boolean
  scheduleFlush: () => void
}

const GLOBAL_STATE_KEY = '__codexObservWatcherState__'

function resolveCodexHome(codexHome?: string): string {
  return codexHome ?? path.join(os.homedir(), '.codex')
}

function createState(): WatcherState {
  const scheduleFlush = debounce(() => {
    void flushQueue()
  }, 500)

  return {
    running: false,
    codexHome: resolveCodexHome(),
    watcher: null,
    subscribers: new Set(),
    lastEvent: null,
    errors: [],
    ingestHandler: async () => ({
      skipped: true,
      reason: 'Ingest handler not registered',
    }),
    ingestQueue: new Set(),
    ingestRunning: false,
    pendingFlush: false,
    scheduleFlush,
  }
}

const globalScope = globalThis as typeof globalThis & {
  __codexObservWatcherState__?: WatcherState
}

const state = globalScope[GLOBAL_STATE_KEY] ?? createState()
globalScope[GLOBAL_STATE_KEY] = state

function publish(event: WatcherEvent): void {
  if (event.type === 'error') {
    state.errors.push(event.payload.error)
    if (state.errors.length > 25) {
      state.errors.shift()
    }
  }
  if ('ts' in event.payload) {
    state.lastEvent = new Date(event.payload.ts)
  }

  for (const subscriber of state.subscribers) {
    try {
      subscriber(event)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      state.errors.push(`Subscriber error: ${message}`)
    }
  }
}

function isRelevantPath(filePath: string): boolean {
  if (filePath.endsWith('codex-tui.log')) {
    return true
  }
  if (filePath.endsWith('history.jsonl')) {
    return true
  }
  return filePath.endsWith('.jsonl')
}

function normalizePaths(paths: string[]): string[] {
  const unique = new Set<string>()
  for (const filePath of paths) {
    if (!filePath) {
      continue
    }
    unique.add(filePath)
  }
  return Array.from(unique)
}

function enqueueIngest(paths: string[]): void {
  const relevant = normalizePaths(paths).filter(isRelevantPath)
  if (relevant.length === 0) {
    return
  }

  for (const filePath of relevant) {
    state.ingestQueue.add(filePath)
  }

  const payload: IngestPayload = {
    status: 'queued',
    files: relevant,
    ts: Date.now(),
  }

  publish({ type: 'ingest', payload })

  state.scheduleFlush()
}

async function flushQueue(): Promise<void> {
  if (state.ingestRunning) {
    state.pendingFlush = true
    return
  }

  if (state.ingestQueue.size === 0) {
    return
  }

  const files = Array.from(state.ingestQueue)
  state.ingestQueue.clear()
  state.ingestRunning = true

  publish({
    type: 'ingest',
    payload: {
      status: 'running',
      files,
      ts: Date.now(),
    },
  })

  const start = performance.now()
  let result: unknown
  let error: string | undefined
  let status: IngestPayload['status'] = 'complete'

  try {
    result = await state.ingestHandler(files)
    if (typeof result === 'object' && result !== null && 'skipped' in result) {
      status = 'skipped'
    }
  } catch (err) {
    status = 'error'
    error = err instanceof Error ? err.message : String(err)
  }

  const durationMs = performance.now() - start
  recordTiming('ingest', durationMs)

  publish({
    type: 'ingest',
    payload: {
      status,
      files,
      durationMs,
      error,
      result,
      ts: Date.now(),
    },
  })

  const metrics: MetricsPayload = {
    ts: Date.now(),
    metrics: getPerformanceSnapshot(),
  }

  publish({ type: 'metrics', payload: metrics })

  state.ingestRunning = false
  if (state.pendingFlush || state.ingestQueue.size > 0) {
    state.pendingFlush = false
    state.scheduleFlush()
  }
}

function handleFileEvent(event: FileChangePayload): void {
  publish({ type: 'file-change', payload: event })

  if (isRelevantPath(event.path)) {
    enqueueIngest([event.path])
    return
  }

  if (event.kind === 'log') {
    const logPath = path.join(state.codexHome, 'log', 'codex-tui.log')
    enqueueIngest([logPath])
  }
}

export function startWatcher(codexHome?: string): void {
  const resolvedHome = resolveCodexHome(codexHome)

  if (state.running) {
    if (state.codexHome === resolvedHome) {
      return
    }
    stopWatcher()
  }

  state.codexHome = resolvedHome

  const watcher = new FileWatcher({
    codexHome: resolvedHome,
    onEvent: handleFileEvent,
    onError: (message) => {
      publish({
        type: 'error',
        payload: {
          ts: Date.now(),
          error: message,
        },
      })
    },
  })

  state.watcher = watcher
  state.running = true

  try {
    watcher.start()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    publish({
      type: 'error',
      payload: {
        ts: Date.now(),
        error: `Watcher failed to start: ${message}`,
      },
    })
  }
}

export function stopWatcher(): void {
  if (!state.running || !state.watcher) {
    return
  }

  state.watcher.stop()
  state.watcher = null
  state.running = false
}

export function getWatcherStatus(): WatcherStatus {
  if (!state.watcher) {
    return {
      running: false,
      watchedPaths: [],
      lastEvent: state.lastEvent,
      errors: [...state.errors],
    }
  }

  const status = state.watcher.getStatus()
  return {
    running: status.running,
    watchedPaths: status.watchedPaths,
    lastEvent: status.lastEvent ?? state.lastEvent,
    errors: [...state.errors, ...status.errors],
  }
}

export function subscribe(callback: (event: WatcherEvent) => void): () => void {
  state.subscribers.add(callback)
  return () => {
    state.subscribers.delete(callback)
  }
}

export function setIngestHandler(handler: IngestHandler): void {
  state.ingestHandler = handler
}
