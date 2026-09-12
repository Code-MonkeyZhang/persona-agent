/**
 * @file src/renderer/lib/appStorage.ts
 * @description 应用状态桥接存储，接口形状与 localStorage 一致
 * - 启动时经 IPC 整取主进程 electron-store 装入内存，此后读取同步走内存
 * - 写操作先更新内存再异步落盘，失败经 logger 记录
 * - 无 window.api 的环境整体退回 localStorage，兼容测试与 node 环境
 */

import { logger } from './logger';

const cache = new Map<string, string>();

/** 标记无 IPC 环境，置位后读写直接走 localStorage */
let useLocalStorage = false;

/** node 测试环境可能没有 localStorage 全局，先探测再访问 */
function getLocalStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

/**
 * 启动时整取主进程应用状态装入内存，渲染前调用一次
 * 无 IPC 时退回 localStorage，取数失败不阻断启动，等价于一次空存储
 */
export async function initAppStorage(): Promise<void> {
  if (!window.api) {
    useLocalStorage = true;
    logger.warn('appStorage', 'window.api missing, fallback to localStorage');
    return;
  }

  try {
    const all = await window.api.stateGetAll();
    for (const [key, value] of Object.entries(all)) {
      cache.set(key, value);
    }
    logger.info('appStorage', `seeded ${cache.size} keys`);
  } catch (err) {
    logger.error(
      'appStorage',
      'stateGetAll failed, start with empty cache',
      err
    );
  }
}

/** 与 localStorage 同形的桥接存储，zustand persist 与散置读写点共用 */
export const appStorage = {
  getItem: (key: string): string | null => {
    if (useLocalStorage) {
      return getLocalStorage()?.getItem(key) ?? null;
    }
    return cache.get(key) ?? null;
  },

  setItem: (key: string, value: string): void => {
    if (useLocalStorage) {
      getLocalStorage()?.setItem(key, value);
      return;
    }
    cache.set(key, value);
    window.api?.stateSet(key, value).catch((err) => {
      logger.error('appStorage', `stateSet ${key} failed`, err);
    });
  },

  removeItem: (key: string): void => {
    if (useLocalStorage) {
      getLocalStorage()?.removeItem(key);
      return;
    }
    cache.delete(key);
    window.api?.stateDelete(key).catch((err) => {
      logger.error('appStorage', `stateDelete ${key} failed`, err);
    });
  },
};
