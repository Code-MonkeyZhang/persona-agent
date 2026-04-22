/**
 * @file src/renderer/stores/scrollPositionCache.ts
 * @description 滚动位置缓存，使用 LRU 策略管理会话切换时的滚动状态
 */
import type { StateSnapshot } from 'react-virtuoso';

/**
 * 滚动位置缓存模块
 *
 * 使用 LRU（最近最少使用）策略管理会话的滚动位置。
 * 当缓存数量超过限制时，自动淘汰最旧的记录。
 */

const MAX_CACHE_SIZE = 100;
const cache = new Map<string, StateSnapshot>();

/**
 * 保存指定会话的滚动状态
 */
export function setScrollPosition(
  sessionId: string,
  state: StateSnapshot
): void {
  cache.delete(sessionId);
  cache.set(sessionId, state);

  if (cache.size > MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
}

/**
 * 获取指定会话的滚动状态
 */
export function getScrollPosition(
  sessionId: string
): StateSnapshot | undefined {
  return cache.get(sessionId);
}

/**
 * 判断是否有指定会话的缓存
 */
export function hasScrollPosition(sessionId: string): boolean {
  return cache.has(sessionId);
}

/**
 * 删除指定会话的滚动状态缓存，用于会话删除时清理
 */
export function deleteScrollPosition(sessionId: string): void {
  cache.delete(sessionId);
}
