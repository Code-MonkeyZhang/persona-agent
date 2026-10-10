/**
 * @fileoverview devices 表的读写。
 *
 * 供 websocket-server 的设备注册流程与 device 路由共用，
 * 设备身份从此持久化，服务器重启不丢失配对记录。
 */

import { getDb } from '../../db/index.js';
import type { DeviceType } from '@persona/shared';
import type { SQLQueryBindings } from 'bun:sqlite';

/** devices 表一行。 */
interface DeviceRow {
  device_id: string;
  name: string;
  type: string;
  paired_at: number;
  last_online: number | null;
}

/** 对外暴露的设备信息，online 由调用方按在线连接合并。 */
export interface DeviceInfo {
  deviceId: string;
  name: string;
  type: string;
  pairedAt: number;
  lastOnline: number | null;
  online: boolean;
}

/** 注册或刷新设备身份，已存在的设备更新名字与在线时间。 */
export function upsertDevice(
  deviceId: string,
  name: string,
  type: DeviceType
): void {
  const now = Date.now();
  getDb()
    .query(
      `INSERT INTO devices (device_id, name, type, paired_at, last_online)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id)
       DO UPDATE SET name = excluded.name, type = excluded.type,
         last_online = excluded.last_online`
    )
    .run(deviceId, name, type, now, now);
}

/** 设备全部连接断开时刷新最后在线时间。 */
export function touchLastOnline(deviceId: string): void {
  getDb()
    .query('UPDATE devices SET last_online = ? WHERE device_id = ?')
    .run(Date.now(), deviceId);
}

/** 列出全部已知设备，按配对时间排序并附加在线标志。 */
export function listDevices(onlineIds: Set<string>): DeviceInfo[] {
  const rows = getDb()
    .query<
      DeviceRow,
      SQLQueryBindings[]
    >('SELECT * FROM devices ORDER BY paired_at')
    .all();
  return rows.map((row) => ({
    deviceId: row.device_id,
    name: row.name,
    type: row.type,
    pairedAt: row.paired_at,
    lastOnline: row.last_online,
    online: onlineIds.has(row.device_id),
  }));
}
