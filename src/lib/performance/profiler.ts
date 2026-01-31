import 'server-only';

import { performance } from 'node:perf_hooks';

type TimingName = string;

export interface TimingSummary {
  count: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  lastMs: number;
  lastAt: number;
}

export interface PerformanceSnapshot {
  generatedAt: number;
  timings: Record<TimingName, TimingSummary>;
}

const timings = new Map<TimingName, TimingSummary>();

export function recordTiming(name: TimingName, durationMs: number): TimingSummary {
  const now = Date.now();
  const existing = timings.get(name);

  if (!existing) {
    const summary: TimingSummary = {
      count: 1,
      totalMs: durationMs,
      avgMs: durationMs,
      minMs: durationMs,
      maxMs: durationMs,
      lastMs: durationMs,
      lastAt: now,
    };
    timings.set(name, summary);
    return summary;
  }

  existing.count += 1;
  existing.totalMs += durationMs;
  existing.avgMs = existing.totalMs / existing.count;
  existing.minMs = Math.min(existing.minMs, durationMs);
  existing.maxMs = Math.max(existing.maxMs, durationMs);
  existing.lastMs = durationMs;
  existing.lastAt = now;

  return existing;
}

export async function measureAsync<T>(
  name: TimingName,
  fn: () => Promise<T>,
  thresholdMs = 100
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const durationMs = performance.now() - start;
    recordTiming(name, durationMs);
    if (durationMs > thresholdMs) {
      console.warn(
        `[PERF] ${name} took ${durationMs.toFixed(2)}ms (threshold ${thresholdMs}ms)`
      );
    }
  }
}

export function measureSync<T>(
  name: TimingName,
  fn: () => T,
  thresholdMs = 100
): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    const durationMs = performance.now() - start;
    recordTiming(name, durationMs);
    if (durationMs > thresholdMs) {
      console.warn(
        `[PERF] ${name} took ${durationMs.toFixed(2)}ms (threshold ${thresholdMs}ms)`
      );
    }
  }
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  const snapshot: PerformanceSnapshot = {
    generatedAt: Date.now(),
    timings: {},
  };

  for (const [name, summary] of timings.entries()) {
    snapshot.timings[name] = { ...summary };
  }

  return snapshot;
}

export function resetPerformanceMetrics(): void {
  timings.clear();
}
