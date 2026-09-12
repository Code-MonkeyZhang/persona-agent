/**
 * @file store/index.ts
 * @description 应用状态存储模块 - 基于 electron-store 实现跨源持久化
 */

import Store from 'electron-store';
import log from 'electron-log';

let store: Store<Record<string, string>> | null = null;

/**
 * 初始化 electron-store 实例，默认写入 Electron userData 目录
 * 开发与生产共用同一份文件，避免应用状态随运行环境分裂
 * 重复调用时直接返回已有实例
 * @returns 初始化后的 Store 实例
 */
export function initStore(): Store<Record<string, string>> {
  if (store) {
    return store;
  }

  store = new Store<Record<string, string>>({
    clearInvalidConfig: true,
  });

  log.info(`Store initialized at: ${store.path}`);

  return store;
}
