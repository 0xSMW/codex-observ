import 'server-only';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function cachedQuery<T>(
  key: string,
  query: () => T,
  ttlMs = 30000
): T {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry && entry.expiresAt > now) {
    return entry.value as T;
  }

  const value = query();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidateCache(key?: string): void {
  if (!key) {
    cache.clear();
    return;
  }
  cache.delete(key);
}

export function getCacheStats(): { size: number } {
  return { size: cache.size };
}
