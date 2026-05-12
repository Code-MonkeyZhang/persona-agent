/**
 * @fileoverview 带 TTL 的内存缓存，用于 WebFetch 结果缓存。
 *
 * 默认 TTL 15 分钟，最大 100 条，满时 FIFO 淘汰最早插入的条目。
 */

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  insertedAt: number;
};

const DEFAULT_CACHE_MAX_ENTRIES = 100;

export function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string
): { value: T; cached: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return { value: entry.value, cached: true };
}

export function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number
): void {
  if (ttlMs <= 0) return;
  if (cache.size >= DEFAULT_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
    insertedAt: Date.now(),
  });
}
