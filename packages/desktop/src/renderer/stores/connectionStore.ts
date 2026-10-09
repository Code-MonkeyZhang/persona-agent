/**
 * @fileoverview 连接事实与设备清单的渲染层镜像。
 *
 * 快照与清单来自主进程的查询与推送，切换与清单动作只做 IPC 转发。
 * connectByAddress 按地址可达、握手识别、条目落位、切换同步四阶段推进，
 * 各阶段失败都有明确的错误码供界面提示。
 */

import { create } from 'zustand';
import {
  LOCAL_DEVICE_ID,
  type ConnectionSnapshot,
  type DeviceEntry,
  type SwitchResult,
} from '@shared/api';
import type { HandshakeInfo } from '@persona/shared';
import { fetchHandshake } from '../lib/api';
import { logger } from '../lib/logger';

/** init 只跑一次的守卫，StrictMode 双挂载不产生重复订阅 */
let initialized = false;

/** 新建连接的推进阶段 */
export type ConnectStage =
  | 'idle'
  | 'probing'
  | 'identifying'
  | 'registering'
  | 'switching';

/** 新建连接的失败原因，界面据此给出明确提示 */
export type ConnectError =
  | 'unreachable'
  | 'handshake_failed'
  | 'version_incompatible'
  | 'identity_mismatch'
  | 'switch_failed';

interface ConnectionState {
  /** 当前连接事实快照，null 表示尚未初始化 */
  snapshot: ConnectionSnapshot | null;
  /** 设备清单镜像，来自主进程 devices.json */
  devices: DeviceEntry[];
  /** 切换进行中 */
  switching: boolean;
  /** 新建连接的推进阶段，非 idle 时按钮转圈 */
  connectStage: ConnectStage;
  /** 新建连接的失败原因，idle 时清空 */
  connectError: ConnectError | null;
  /** 拉快照与清单并订阅连接变更，应用挂载时调用一次 */
  init: () => void;
  /** 切换到目标主机，失败落日志并返回带错误码的结果 */
  switchHost: (
    hostId: string,
    address: string | null
  ) => Promise<SwitchResult | null>;
  /** 新建连接，识别为旧主机则更新地址，新主机建条目 */
  connectByAddress: (address: string) => Promise<boolean>;
  /** 设备改名，只影响本机显示 */
  renameDevice: (hostId: string, name: string) => Promise<void>;
  /** 改地址，改的是当前连着的设备时用新地址重连一次 */
  updateDeviceAddress: (hostId: string, address: string) => Promise<void>;
  /** 删除条目并释放本地镜像，删当前主机时先切回本机 */
  removeDevice: (hostId: string) => Promise<boolean>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  snapshot: null,
  devices: [],
  switching: false,
  connectStage: 'idle',
  connectError: null,

  init: () => {
    if (initialized) return;
    initialized = true;

    void window.api
      ?.getConnection()
      .then((snapshot) => set({ snapshot }))
      .catch((err) => logger.warn('[Connection] get snapshot failed:', err));
    void refreshDevices(set);

    window.api?.onConnectionChanged((snapshot) => {
      logger.info(
        `[Connection] Changed to ${snapshot.current.hostId} at ${snapshot.current.address}`
      );
      set({ snapshot });
      void refreshDevices(set);
    });
  },

  /** 切换到目标主机，失败落日志并返回带错误码的结果 */
  switchHost: async (hostId, address) => {
    set({ switching: true });
    try {
      const result =
        (await window.api?.switchHost({ hostId, address })) ?? null;
      if (!result?.ok) {
        logger.warn(
          `[Connection] Switch to ${hostId} failed: ${result?.ok === false ? result.error : 'ipc unavailable'}`
        );
      }
      return result;
    } finally {
      set({ switching: false });
    }
  },

  connectByAddress: async (input) => {
    const address = input.trim().replace(/\/+$/, '');
    /** 阶段复位并落失败原因，返回是否成功 */
    const finish = (error: ConnectError | null): boolean => {
      set({ connectStage: 'idle', connectError: error });
      return !error;
    };

    if (!address) return finish('unreachable');

    set({ connectStage: 'probing', connectError: null });
    try {
      const probe = await fetch(`${address}/health`);
      if (!probe.ok) return finish('unreachable');
    } catch {
      return finish('unreachable');
    }

    set({ connectStage: 'identifying' });
    let info: HandshakeInfo;
    try {
      info = await fetchHandshake(address);
    } catch {
      return finish('handshake_failed');
    }

    const appVersion = await window.api?.updater.getVersion();
    if (appVersion && appVersion.split('.')[0] !== info.version.split('.')[0]) {
      return finish('version_incompatible');
    }

    set({ connectStage: 'registering' });
    await window.api?.upsertDevice({
      hostId: info.hostId,
      hostName: info.hostName,
      address,
    });
    await refreshDevices(set);

    set({ connectStage: 'switching' });
    const result = await get().switchHost(info.hostId, address);
    if (!result?.ok) {
      return finish(result ? result.error : 'switch_failed');
    }
    logger.info(`[Connection] Connected device ${info.hostId} at ${address}`);
    return finish(null);
  },

  renameDevice: async (hostId, name) => {
    await window.api?.renameDevice(hostId, name);
    await refreshDevices(set);
  },

  updateDeviceAddress: async (hostId, address) => {
    const entry = get().devices.find((d) => d.hostId === hostId);
    const clean = address.trim().replace(/\/+$/, '');
    if (!entry || !clean) return;
    await window.api?.upsertDevice({
      hostId,
      hostName: entry.hostName ?? '',
      address: clean,
    });
    await refreshDevices(set);
    // 改的是当前连着的设备时，用新地址重连一次
    const snapshot = get().snapshot;
    if (
      snapshot &&
      (snapshot.current.hostId === hostId ||
        currentDeviceKey(snapshot) === hostId)
    ) {
      await get().switchHost(hostId, clean);
    }
  },

  removeDevice: async (hostId) => {
    if (hostId === LOCAL_DEVICE_ID) return false;
    // 删除当前连着的主机前先切回本机，应用不停在已删除的数据上
    const snapshot = get().snapshot;
    if (snapshot && currentDeviceKey(snapshot) === hostId) {
      const back = await get().switchHost(LOCAL_DEVICE_ID, null);
      if (!back?.ok) return false;
    }
    const ok = (await window.api?.removeDevice(hostId)) ?? false;
    if (ok) {
      await refreshDevices(set);
    }
    return ok;
  },
}));

/** 清单随连接变化刷新，lastConnectedAt 与 currentHostId 由主进程侧维护 */
async function refreshDevices(
  set: (partial: Partial<ConnectionState>) => void
): Promise<void> {
  try {
    const devices = await window.api?.getDevices();
    if (devices) set({ devices });
  } catch (err) {
    logger.warn('[Connection] get devices failed:', err);
  }
}

/** 当前设备在清单里的标识，本机连接归位为 local */
export function currentDeviceKey(snapshot: ConnectionSnapshot): string {
  return snapshot.current.hostId === snapshot.local.hostId
    ? LOCAL_DEVICE_ID
    : snapshot.current.hostId;
}

/** 显示名顺序：用户改名优先，自称名次之，hostId 前几位兜底 */
export function deviceDisplayName(entry: DeviceEntry): string {
  return entry.name ?? entry.hostName ?? entry.hostId.slice(0, 8);
}

/** 条目状态点：本机常驻在线，当前主机跟随连接事实，其余视为离线 */
export function deviceStatus(
  entry: DeviceEntry,
  snapshot: ConnectionSnapshot | null
): 'online' | 'connecting' | 'offline' {
  if (entry.hostId === LOCAL_DEVICE_ID) return 'online';
  if (!snapshot) return 'offline';
  const isCurrent =
    entry.hostId === snapshot.current.hostId ||
    entry.hostId === currentDeviceKey(snapshot);
  if (!isCurrent) return 'offline';
  if (snapshot.current.status === 'connected') return 'online';
  if (snapshot.current.status === 'connecting') return 'connecting';
  return 'offline';
}
