export interface DateRange {
  startMs?: number;
  endMs?: number;
}

export interface DateRangeParseResult {
  range: DateRange;
  errors: string[];
}

const START_KEYS = ['start', 'startDate', 'from', 'since'];
const END_KEYS = ['end', 'endDate', 'to', 'until'];

function firstParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value) {
      return value;
    }
  }
  return null;
}

export function parseDate(value: string): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
    return null;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

export function getDateRange(params: URLSearchParams): DateRangeParseResult {
  const errors: string[] = [];
  const startRaw = firstParam(params, START_KEYS);
  const endRaw = firstParam(params, END_KEYS);

  const startMs = startRaw ? parseDate(startRaw) : null;
  const endMs = endRaw ? parseDate(endRaw) : null;

  if (startRaw && startMs === null) {
    errors.push(`Invalid start date: ${startRaw}`);
  }
  if (endRaw && endMs === null) {
    errors.push(`Invalid end date: ${endRaw}`);
  }

  const range: DateRange = {};
  if (startMs !== null) {
    range.startMs = startMs;
  }
  if (endMs !== null) {
    range.endMs = endMs;
  }

  if (
    range.startMs !== undefined &&
    range.endMs !== undefined &&
    range.startMs > range.endMs
  ) {
    const tmp = range.startMs;
    range.startMs = range.endMs;
    range.endMs = tmp;
  }

  return { range, errors };
}

export function applyDateRange(
  field: string,
  range: DateRange,
  where: string[],
  params: unknown[]
): void {
  if (range.startMs !== undefined) {
    where.push(`${field} >= ?`);
    params.push(range.startMs);
  }
  if (range.endMs !== undefined) {
    where.push(`${field} <= ?`);
    params.push(range.endMs);
  }
}

export function rangeToResponse(range: DateRange): {
  start: string | null;
  end: string | null;
  startMs?: number;
  endMs?: number;
} {
  return {
    start: range.startMs !== undefined ? new Date(range.startMs).toISOString() : null,
    end: range.endMs !== undefined ? new Date(range.endMs).toISOString() : null,
    ...(range.startMs !== undefined ? { startMs: range.startMs } : {}),
    ...(range.endMs !== undefined ? { endMs: range.endMs } : {}),
  };
}

export function getPreviousRange(range: DateRange): DateRange | null {
  if (range.startMs === undefined || range.endMs === undefined) {
    return null;
  }
  const duration = range.endMs - range.startMs;
  if (duration <= 0) {
    return null;
  }
  const prevEnd = range.startMs - 1;
  const prevStart = prevEnd - duration;
  return { startMs: prevStart, endMs: prevEnd };
}
