/**
 * @fileoverview 设备身份管理。
 * deviceId 永久保存在应用状态存储，WS 注册使用同一身份。
 */

import { logger } from './logger';
import { appStorage } from './appStorage';

const DEVICE_ID_KEY = 'deviceId';

/**
 * 从 appStorage 获取或生成永久 deviceId。
 * 旧版身份落在 localStorage，首次读到时搬进应用状态存储并清理旧键，
 * 避免已有设备在升级后以新身份重复注册。
 * @returns 设备唯一标识
 */
export function getOrCreateDeviceId(): string {
  let id = appStorage.getItem(DEVICE_ID_KEY);
  if (!id && typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem(DEVICE_ID_KEY);
    if (legacy) {
      id = legacy;
      appStorage.setItem(DEVICE_ID_KEY, id);
      localStorage.removeItem(DEVICE_ID_KEY);
      logger.info(`[DeviceId] migrated legacy deviceId: ${id}`);
    }
  }
  if (!id) {
    id = crypto.randomUUID();
    appStorage.setItem(DEVICE_ID_KEY, id);
    logger.info(`[DeviceId] Generated new deviceId: ${id}`);
  }
  return id;
}
