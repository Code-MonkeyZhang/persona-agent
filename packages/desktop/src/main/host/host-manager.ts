/**
 * @file main/host/host-manager.ts
 * @description 连接状态机 - 主进程持有连接事实的唯一来源，镜像库随连接开合，渲染层与镜像层只认连接不感知进程
 */

import log from 'electron-log';
import { join } from 'path';
import * as fs from 'fs';
import type {
  ConnectionSnapshot,
  DeviceEntry,
  HostConnection,
  SwitchResult,
} from '@shared/api';
import type { HandshakeInfo } from '@persona/shared';
import { CacheDb } from '../cache/cache-db';
import {
  deviceCacheDir,
  mirrorPathFor,
  migrateLegacyMirrors,
  migrateLegacyPartitions,
  foldPseudoLocalDir,
} from '../cache/cache-layout';
import { LocalHostProvider } from './local-host-provider';
import { DeviceRegistry } from './device-registry';

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
 * 本机连接由 provider 常驻提供，远程连接切换进入。
 * 切换点选即落位，开新库关旧库记身份广播在前，握手退到落位后核身，
 * 核身失败只置断连不回滚视图，镜像来源错配整库重建自愈。
 */
export class HostManager {
  private localConnection: HostConnection = {
    hostId: '',
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
  }

  /**
   * 建立本机连接，应用启动时调用一次。
   * provider 负责拉起进程并等待就绪，随后握手取真实主机身份，
   * 握手失败退回清单里本机条目上次的主机号，彻底未知则不开镜像。
   * 身份就位后先收敛存储布局再落位条目开镜像库，结果广播给订阅方。
   */
  async ensureLocal(): Promise<void> {
    log.info('[host] Establishing local connection');
    const address = await this.localProvider.start();
    let hostId = '';
    if (address) {
      const handshake = await fetchHandshake(address);
      if (handshake) {
        hostId = handshake.hostId;
        log.info(
          `[host] Local handshake hostName=${handshake.hostName} version=${handshake.version}`
        );
      } else {
        log.warn(
          '[host] Local handshake failed, falling back to the registered identity'
        );
      }
    }
    if (!hostId) {
      hostId =
        this.deviceRegistry.load().devices.find((d) => d.local)?.hostId ?? '';
    }
    this.localConnection = {
      hostId,
      address,
      status: address ? 'connected' : 'disconnected',
    };
    this.currentConnection = this.localConnection;
    if (hostId) {
      this.settleLocalStorage(hostId);
      this.cacheDb = this.openCache(
        this.localConnection,
        mirrorPathFor(this.dataDir, hostId)
      );
    } else {
      log.warn('[host] Local identity unknown, mirror stays closed');
    }
    this.recordSwitch(hostId);
    log.info(
      `[host] Local connection is ${this.localConnection.status}, hostId=${hostId || 'unknown'}`
    );
    this.emit();
  }

  /**
   * 切换到目标主机，串行队列里原子执行。
   * 本机目标直接切回常驻连接；远程目标点选即落位，开库记身份广播在前，
   * 握手退到落位后核身，失败或身份不符只置断连不回滚视图。
   */
  async switchHost(
    hostId: string,
    address: string | null
  ): Promise<SwitchResult> {
    const run = async (): Promise<SwitchResult> => {
      if (hostId === this.localConnection.hostId) {
        if (!hostId) {
          return { ok: false, error: 'unreachable' };
        }
        await this.applyConnection(
          this.localConnection,
          mirrorPathFor(this.dataDir, this.localConnection.hostId)
        );
        this.recordSwitch(hostId);
        return { ok: true };
      }
      if (!address) {
        return { ok: false, error: 'unreachable' };
      }
      // 落位在前，界面立即切到目标主机的镜像，核身结果只回写连接状态
      await this.applyConnection(
        { hostId, address, status: 'connecting' },
        mirrorPathFor(this.dataDir, hostId)
      );
      this.recordSwitch(hostId);
      const handshake = await fetchHandshake(address);
      if (!handshake) {
        log.warn(`[host] Handshake failed for ${address}`);
        this.setConnectionStatus('disconnected');
        return { ok: false, error: 'handshake_failed' };
      }
      if (handshake.hostId !== hostId) {
        log.warn(
          `[host] Identity mismatch: expect ${hostId} got ${handshake.hostId}`
        );
        this.setConnectionStatus('disconnected');
        return { ok: false, error: 'identity_mismatch' };
      }
      this.setConnectionStatus('connected');
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

  /** 条目落位，旧主机只更新地址，新主机建条目并用自称名作 name 初始值 */
  upsertDevice(hostId: string, hostName: string, address: string): void {
    const data = this.deviceRegistry.load();
    const entry = data.devices.find((d) => d.hostId === hostId);
    if (entry) {
      entry.address = address;
      log.info(`[host] Device ${hostId} re-registered at ${address}`);
    } else {
      data.devices.push({
        hostId,
        name: hostName,
        address,
        lastConnectedAt: null,
        local: false,
      });
      log.info(
        `[host] Device ${hostId} registered at ${address} as "${hostName}"`
      );
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

  /** 删除条目并释放该设备的整个缓存目录，镜像库与附件分区一并消失，本机不可删 */
  removeDevice(hostId: string): boolean {
    if (hostId === this.localConnection.hostId) {
      log.warn('[host] Refused to remove the local device');
      return false;
    }
    const data = this.deviceRegistry.load();
    data.devices = data.devices.filter((d) => d.hostId !== hostId);
    this.deviceRegistry.save(data);
    fs.rmSync(deviceCacheDir(this.dataDir, hostId), {
      recursive: true,
      force: true,
    });
    log.info(`[host] Device ${hostId} removed with its cache directory`);
    return true;
  }

  /**
   * 统一存储布局的一次性收敛，本机身份就位后、开镜像库前调用。
   * 旧布局的镜像文件与图片分区迁进真实主机号目录，local 别名的伪设备目录并入，
   * 本机条目随身份落位，身份变化时旧主机号的设备目录连同缓存清理。
   */
  private settleLocalStorage(hostId: string): void {
    const logMigration = (message: string): void => log.info(message);
    migrateLegacyMirrors(this.dataDir, hostId, logMigration);
    migrateLegacyPartitions(this.dataDir, logMigration);
    foldPseudoLocalDir(this.dataDir, hostId, logMigration);
    const replaced = this.deviceRegistry.setLocalEntry(hostId);
    if (replaced) {
      fs.rmSync(deviceCacheDir(this.dataDir, replaced), {
        recursive: true,
        force: true,
      });
      log.warn(`[host] Local identity changed, removed cache of ${replaced}`);
    }
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

  /** 落位后的核身回写，只改连接状态并广播，视图与镜像不动 */
  private setConnectionStatus(status: HostConnection['status']): void {
    this.currentConnection = { ...this.currentConnection, status };
    log.info(
      `[host] ${this.currentConnection.hostId} connection status -> ${status}`
    );
    this.emit();
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
  private openCache(connection: HostConnection, mirrorPath: string): CacheDb {
    const db = new CacheDb(mirrorPath, connection.hostId, (message) =>
      log.info(message)
    );
    db.onChanged = this.broadcastCacheChanged;
    if (db.getSourceHostId() !== connection.hostId) {
      log.warn(
        `[host] Mirror source mismatch on ${mirrorPath}, rebuilding for ${connection.hostId}`
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

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
