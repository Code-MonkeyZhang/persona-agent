/**
 * @file main/host/host-manager.ts
 * @description 连接状态机 - 主进程持有连接事实的唯一来源，镜像库随连接开合，渲染层与镜像层只认连接不感知进程
 */

import log from 'electron-log';
import { join } from 'path';
import * as fs from 'fs';
import { LOCAL_DEVICE_ID } from '@shared/api';
import type {
  ConnectionSnapshot,
  DeviceEntry,
  HostConnection,
  SwitchResult,
} from '@shared/api';
import type { HandshakeInfo } from '@persona/shared';
import { CacheDb } from '../cache/cache-db';
import { LocalHostProvider } from './local-host-provider';
import { DeviceRegistry } from './device-registry';

/** 本机主机的兜底标识，握手失败时代替真实身份 */
export const LOCAL_HOST_ID = 'local';

/** 本机镜像文件名，每主机一个库文件，本机固定此名 */
const LOCAL_CACHE_FILE = 'cache-local.db';

/** 旧版镜像文件名，启动时检测到即一次性迁移 */
const LEGACY_CACHE_FILE = 'desktop-cache.db';

/**
 * 取目标地址的握手信息。
 * 地址不可达、响应异常或形状不对都返回 null，由调用方决定兜底策略。
 */
export async function fetchHandshake(
  address: string
): Promise<HandshakeInfo | null> {
  try {
    const response = await fetch(`${address}/api/handshake`);
    if (!response.ok) return null;
    const info = (await response.json()) as HandshakeInfo;
    if (!info.hostId || !info.hostName || !info.version) return null;
    return info;
  } catch {
    return null;
  }
}

/**
 * 连接事实的唯一来源。
 * 本机连接由 provider 常驻提供，远程连接经握手识别后切换进入。
 * 切换是串行原子操作：开新库关旧库，失败回滚，镜像来源错配整库重建自愈。
 */
export class HostManager {
  private localConnection: HostConnection = {
    hostId: LOCAL_HOST_ID,
    address: null,
    status: 'connecting',
  };
  private currentConnection: HostConnection = this.localConnection;
  private listeners: Array<(snapshot: ConnectionSnapshot) => void> = [];
  /** 当前镜像库，随连接开合，切换窗口期短暂为 null */
  private cacheDb: CacheDb | null = null;
  /** 切换串行队列，前一次切换完成前不接纳下一次 */
  private switchChain: Promise<unknown> = Promise.resolve();
  private readonly deviceRegistry: DeviceRegistry;
  /** 镜像库数据变化时通知全部窗口，由启动编排注入 */
  private readonly broadcastCacheChanged: () => void;

  constructor(
    private readonly localProvider: LocalHostProvider,
    private readonly dataDir: string,
    broadcastCacheChanged: () => void
  ) {
    this.deviceRegistry = new DeviceRegistry(
      join(dataDir, 'config', 'devices.json'),
      (message) => log.info(message)
    );
    this.broadcastCacheChanged = broadcastCacheChanged;
    this.migrateLegacyCacheDb();
  }

  /**
   * 建立本机连接，应用启动时调用一次。
   * provider 负责拉起进程并等待就绪，随后握手取真实主机身份，
   * 本机镜像库随连接打开，结果广播给订阅方。
   */
  async ensureLocal(): Promise<void> {
    log.info('[host] Establishing local connection');
    const address = await this.localProvider.start();
    let hostId = LOCAL_HOST_ID;
    if (address) {
      const handshake = await fetchHandshake(address);
      if (handshake) {
        hostId = handshake.hostId;
        log.info(
          `[host] Local handshake hostName=${handshake.hostName} version=${handshake.version}`
        );
      } else {
        log.warn('[host] Local handshake failed, fallback to local id');
      }
    }
    this.localConnection = address
      ? { hostId, address, status: 'connected' }
      : { hostId: LOCAL_HOST_ID, address: null, status: 'disconnected' };
    this.currentConnection = this.localConnection;
    this.cacheDb = this.openCache(this.localConnection, LOCAL_CACHE_FILE);
    this.recordSwitch(LOCAL_DEVICE_ID);
    log.info(
      `[host] Local connection is ${this.localConnection.status}, hostId=${this.localConnection.hostId}`
    );
    this.emit();
  }

  /**
   * 切换到目标主机，串行队列里原子执行。
   * 远程目标先握手核身，身份不符即失败；本机目标直接切回常驻连接。
   * 成功后关旧库开新库并广播，失败回滚原连接。
   */
  async switchHost(
    hostId: string,
    address: string | null
  ): Promise<SwitchResult> {
    const run = async (): Promise<SwitchResult> => {
      if (hostId === LOCAL_DEVICE_ID) {
        await this.applyConnection(this.localConnection, LOCAL_CACHE_FILE);
        this.recordSwitch(hostId);
        return { ok: true };
      }
      if (!address) {
        return { ok: false, error: 'unreachable' };
      }
      const handshake = await fetchHandshake(address);
      if (!handshake) {
        log.warn(`[host] Handshake failed for ${address}`);
        return { ok: false, error: 'handshake_failed' };
      }
      if (handshake.hostId !== hostId) {
        log.warn(
          `[host] Identity mismatch: expect ${hostId} got ${handshake.hostId}`
        );
        return { ok: false, error: 'identity_mismatch' };
      }
      await this.applyConnection(
        { hostId, address, status: 'connected' },
        `cache-${hostId}.db`
      );
      this.recordSwitch(hostId);
      return { ok: true };
    };
    const result = this.switchChain.then(run, run);
    this.switchChain = result.catch(() => undefined);
    return result;
  }

  /** 取连接事实快照，current 是当前连接，local 是本机常驻连接 */
  getSnapshot(): ConnectionSnapshot {
    return { current: this.currentConnection, local: this.localConnection };
  }

  /** 取当前连接地址，未就绪时返回 null */
  getAddress(): string | null {
    return this.currentConnection.address;
  }

  /** 取当前镜像库，切换窗口期为 null，调用方按未就绪处理 */
  getCacheDb(): CacheDb | null {
    return this.cacheDb;
  }

  /** 取设备清单，主进程独家读口 */
  getDevices(): DeviceEntry[] {
    return this.deviceRegistry.load().devices;
  }

  /** 条目落位，旧主机更新地址与自称名，新主机建条目 */
  upsertDevice(hostId: string, hostName: string, address: string): void {
    const data = this.deviceRegistry.load();
    const entry = data.devices.find((d) => d.hostId === hostId);
    if (entry) {
      entry.address = address;
      entry.hostName = hostName;
      log.info(`[host] Device ${hostId} re-registered at ${address}`);
    } else {
      data.devices.push({
        hostId,
        name: null,
        hostName,
        address,
        lastConnectedAt: null,
      });
      log.info(`[host] Device ${hostId} registered at ${address}`);
    }
    this.deviceRegistry.save(data);
  }

  /** 改名只动本机的显示名 */
  renameDevice(hostId: string, name: string): void {
    const data = this.deviceRegistry.load();
    const entry = data.devices.find((d) => d.hostId === hostId);
    if (!entry) return;
    entry.name = name;
    this.deviceRegistry.save(data);
  }

  /** 删除条目并释放该主机的本地镜像文件族，本机不可删 */
  removeDevice(hostId: string): boolean {
    if (hostId === LOCAL_DEVICE_ID) {
      log.warn('[host] Refused to remove the local device');
      return false;
    }
    const data = this.deviceRegistry.load();
    data.devices = data.devices.filter((d) => d.hostId !== hostId);
    this.deviceRegistry.save(data);
    for (const suffix of ['', '-wal', '-shm']) {
      const file = join(this.dataDir, `cache-${hostId}.db${suffix}`);
      if (fs.existsSync(file)) {
        fs.rmSync(file);
      }
    }
    log.info(`[host] Device ${hostId} removed with its mirror`);
    return true;
  }

  /** 订阅连接变更，返回退订函数 */
  subscribe(listener: (snapshot: ConnectionSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  /** 关闭当前镜像库，应用退出前调用 */
  closeCache(): void {
    this.cacheDb?.close();
    this.cacheDb = null;
  }

  /**
   * 换连接对象与镜像库，先开新库再关旧库避免空窗。
   * 开新库失败时回滚到原连接与原库，连接事实不变。
   */
  private async applyConnection(
    connection: HostConnection,
    cacheFile: string
  ): Promise<void> {
    const previousConnection = this.currentConnection;
    const previousDb = this.cacheDb;
    log.info(
      `[host] Switching to ${connection.hostId} at ${connection.address}`
    );
    try {
      const nextDb = this.openCache(connection, cacheFile);
      this.cacheDb = nextDb;
      this.currentConnection = connection;
      log.info(
        `[host] Closing previous mirror for ${previousConnection.hostId}`
      );
      previousDb?.close();
    } catch (err) {
      this.cacheDb = previousDb;
      this.currentConnection = previousConnection;
      log.error('[host] Switch failed, rolled back:', err);
      throw err;
    }
    log.info(`[host] Switched to ${connection.hostId}, broadcasting`);
    this.emit();
    this.broadcastCacheChanged();
  }

  /**
   * 打开主机的镜像库并挂缓存通知。
   * 来源错配说明库文件来自另一台主机或主机换了身份，整库作废重建，
   * 游标归零后同步器走快照自愈。
   */
  private openCache(connection: HostConnection, cacheFile: string): CacheDb {
    const db = new CacheDb(
      join(this.dataDir, cacheFile),
      connection.hostId,
      (message) => log.info(message)
    );
    db.onChanged = this.broadcastCacheChanged;
    if (db.getSourceHostId() !== connection.hostId) {
      log.warn(
        `[host] Mirror source mismatch on ${cacheFile}, rebuilding for ${connection.hostId}`
      );
      db.reset();
    }
    return db;
  }

  /** 把切换结果写进设备清单，currentHostId 与 lastConnectedAt 同步更新 */
  private recordSwitch(hostId: string): void {
    const data = this.deviceRegistry.load();
    data.currentHostId = hostId;
    const entry = data.devices.find((d) => d.hostId === hostId);
    if (entry) {
      entry.lastConnectedAt = Date.now();
    }
    this.deviceRegistry.save(data);
  }

  /**
   * 旧镜像文件一次性迁移为 cache-local.db。
   * WAL 与 shm 伴生文件随主文件一起改名，未落盘的 WAL 内容不丢。
   * 伴生先改主文件后改，主文件的存在性就是迁移完成标记，中断后重跑幂等。
   */
  private migrateLegacyCacheDb(): void {
    const legacy = join(this.dataDir, LEGACY_CACHE_FILE);
    const target = join(this.dataDir, LOCAL_CACHE_FILE);
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      for (const suffix of ['-shm', '-wal']) {
        const from = `${legacy}${suffix}`;
        if (fs.existsSync(from)) {
          fs.renameSync(from, `${target}${suffix}`);
        }
      }
      fs.renameSync(legacy, target);
      log.info(`[host] Migrated ${LEGACY_CACHE_FILE} to ${LOCAL_CACHE_FILE}`);
    }
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
