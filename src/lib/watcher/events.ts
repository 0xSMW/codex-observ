import type { PerformanceSnapshot } from '@/lib/performance/profiler';

export type WatcherEvent =
  | { type: 'file-change'; payload: FileChangePayload }
  | { type: 'ingest'; payload: IngestPayload }
  | { type: 'metrics'; payload: MetricsPayload }
  | { type: 'error'; payload: ErrorPayload };

export type FileKind = 'sessions' | 'log' | 'history' | 'config' | 'unknown';

export interface FileChangePayload {
  path: string;
  kind: FileKind;
  eventType: 'change' | 'rename';
  ts: number;
}

export type IngestStatus = 'queued' | 'running' | 'complete' | 'error' | 'skipped';

export interface IngestPayload {
  status: IngestStatus;
  files: string[];
  ts: number;
  durationMs?: number;
  error?: string;
  result?: unknown;
}

export interface MetricsPayload {
  ts: number;
  metrics: PerformanceSnapshot;
}

export interface ErrorPayload {
  ts: number;
  error: string;
}

export interface WatcherStatus {
  running: boolean;
  watchedPaths: string[];
  lastEvent: Date | null;
  errors: string[];
}
