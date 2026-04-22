/**
 * @file store/index.ts
 * @description 本地配置存储模块 - 基于 electron-store 实现持久化配置
 */

import Store from 'electron-store';
import { app } from 'electron';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log';
import type { AppConfig } from '../types/config';

let store: Store<AppConfig> | null = null;

/**
 * 初始化 electron-store 实例，开发环境使用项目根目录，生产环境使用 Electron userData 目录
 * 重复调用时直接返回已有实例
 * @returns 初始化后的 Store 实例
 */
export function initStore(): Store<AppConfig> {
  if (store) {
    return store;
  }

  const cwd = is.dev ? process.cwd() : app.getPath('userData');

  store = new Store<AppConfig>({
    cwd,
    clearInvalidConfig: true,
    defaults: {
      killServerOnExit: false,
    },
  });

  log.info(`Store initialized at: ${store.path}`);

  return store;
}

/**
 * 获取当前已初始化的 Store 实例，未初始化时返回 null
 * @returns Store 实例或 null
 */
export function getStore(): Store<AppConfig> | null {
  return store;
}
