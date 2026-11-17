/**
 * @fileoverview devices.json 设备清单的独家读写。
 *
 * 清单是客户端自有状态，记录连过的主机与本机内置条目。
 * 条目的 hostId 一律是握手返回的真实主机号，本机条目靠 local 标记区分。
 * 写入走临时文件加 rename，主进程单侧持有，HostManager 之外不经手。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { type DeviceEntry } from '@shared/api';

/** devices.json 全量形状 */
export interface DeviceRegistryData {
  /** 当前连接的设备标识，随连接落位更新 */
  currentHostId: string;
  devices: DeviceEntry[];
}

/** 旧清单里本机条目的字面量主机号，迁移时改写成真实主机号 */
const LEGACY_LOCAL_HOST_ID = 'local';

/** 空清单，条目随握手与连接逐步落位 */
export function emptyRegistry(): DeviceRegistryData {
  return { currentHostId: '', devices: [] };
}

/**
 * 设备清单的读写。
 * 读路径做形状归一，文件缺失或 JSON 损坏时回退空清单，
 * 让调用方拿到的永远是可用的清单。
 */
export class DeviceRegistry {
  constructor(
    private readonly filePath: string,
    private readonly log: (message: string) => void = () => {}
  ) {}

  /** 读清单，异常形状回退空清单 */
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
    for (const device of data.devices) {
      device.local = device.local === true;
    }
    return data;
  }

  /**
   * 落位本机条目，返回被替换掉的旧主机号。
   * 旧清单里字面量主机号的条目改写成真实主机号并补标记，
   * 既有本机条目主机号变化时原位改写，旧主机号交给调用方清理缓存目录。
   * @param hostId - 本机服务器的真实主机号
   * @returns 被替换的旧主机号，无替换发生时为 null
   */
  setLocalEntry(hostId: string): string | null {
    const data = this.load();
    const legacy = data.devices.find((d) => d.hostId === LEGACY_LOCAL_HOST_ID);
    if (legacy) {
      legacy.hostId = hostId;
      legacy.local = true;
      this.save(data);
      this.log(`[DeviceRegistry] Rewrote legacy local entry to ${hostId}`);
      return null;
    }
    const existing = data.devices.find((d) => d.local);
    if (!existing) {
      data.devices.push({
        hostId,
        name: null,
        address: null,
        lastConnectedAt: null,
        local: true,
      });
      this.save(data);
      this.log(`[DeviceRegistry] Local entry registered as ${hostId}`);
      return null;
    }
    if (existing.hostId === hostId) {
      return null;
    }
    const previous = existing.hostId;
    existing.hostId = hostId;
    this.save(data);
    this.log(
      `[DeviceRegistry] Local identity changed ${previous} -> ${hostId}`
    );
    return previous;
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
