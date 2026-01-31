export function parseListParam(
  params: URLSearchParams,
  keys: string[]
): string[] {
  for (const key of keys) {
    const raw = params.get(key);
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export function parseSearchParam(params: URLSearchParams, keys: string[]): string | null {
  for (const key of keys) {
    const raw = params.get(key);
    if (raw && raw.trim()) {
      return raw.trim();
    }
  }
  return null;
}
