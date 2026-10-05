/**
 * @fileoverview 设备身份管理。
 * deviceId 永久保存在 localStorage，WS 注册使用同一身份。
 */

import { logger } from './logger';

const DEVICE_ID_KEY = 'deviceId';

/**
 * 从 localStorage 获取或生成永久 deviceId。
 * @returns 设备唯一标识
 */
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    logger.info(`[DeviceId] Generated new deviceId: ${id}`);
  }
  return id;
}
