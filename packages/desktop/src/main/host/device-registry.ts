/**
 * @fileoverview devices.json 设备清单的独家读写。
 *
 * 清单是客户端自有状态，记录连过的主机与本机内置条目。
 * 写入走临时文件加 rename，主进程单侧持有，HostManager 之外不经手。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOCAL_DEVICE_ID, type DeviceEntry } from '@shared/api';

/** devices.json 全量形状 */
export interface DeviceRegistryData {
  /** 当前连接的设备标识，启动固定归位本机 */
  currentHostId: string;
  devices: DeviceEntry[];
}

/** 内置本机条目 */
function localEntry(): DeviceEntry {
  return {
    hostId: LOCAL_DEVICE_ID,
    name: null,
    address: null,
    lastConnectedAt: null,
  };
}

/** 空清单，只有本机条目 */
export function emptyRegistry(): DeviceRegistryData {
  return { currentHostId: LOCAL_DEVICE_ID, devices: [localEntry()] };
}

/**
 * 设备清单的读写。
 * 读路径做形状归一，文件缺失、JSON 损坏或缺本机条目时回退或补齐，
 * 让调用方拿到的永远是可用的清单。
 */
export class DeviceRegistry {
  constructor(
    private readonly filePath: string,
    private readonly log: (message: string) => void = () => {}
  ) {}

  /** 读清单，异常形状回退内置本机条目 */
  load(): DeviceRegistryData {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath, 'utf-8');
    } catch {
      return emptyRegistry();
    }

    let data: DeviceRegistryData;
    try {
      data = JSON.parse(raw) as DeviceRegistryData;
    } catch {
      this.log(`[DeviceRegistry] Corrupt file, falling back: ${this.filePath}`);
      return emptyRegistry();
    }

    if (!Array.isArray(data.devices)) {
      this.log('[DeviceRegistry] Missing devices array, falling back');
      return emptyRegistry();
    }

    this.migrateLegacyHostName(data.devices);

    if (!data.devices.some((d) => d.hostId === LOCAL_DEVICE_ID)) {
      data.devices.unshift(localEntry());
    }
    if (!data.currentHostId) {
      data.currentHostId = LOCAL_DEVICE_ID;
    }
    return data;
  }

  /**
   * 旧模型的一次性迁移：旧版把握手自称名单独存成 hostName 字段且每次连接刷新。
   * 未改名的条目把它抄进 name 后删除该字段，改过名的直接删除，幂等可重跑。
   */
  private migrateLegacyHostName(devices: DeviceEntry[]): void {
    let migrated = 0;
    for (const device of devices as Array<
      DeviceEntry & { hostName?: string | null }
    >) {
      if (!('hostName' in device)) continue;
      if (device.name == null && device.hostName != null) {
        device.name = device.hostName;
      }
      delete device.hostName;
      migrated += 1;
    }
    if (migrated > 0) {
      this.log(
        `[DeviceRegistry] Migrated ${migrated} devices to the local-label model`
      );
    }
  }

  /** 原子写清单，临时文件加 rename，中途断电不产生半份文件 */
  save(data: DeviceRegistryData): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
    this.log(`[DeviceRegistry] Saved ${data.devices.length} devices`);
  }
}
