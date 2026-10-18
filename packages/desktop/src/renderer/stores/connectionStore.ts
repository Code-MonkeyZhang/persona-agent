/**
 * @fileoverview 连接事实与设备清单的渲染层镜像。
 *
 * 快照与清单来自主进程的查询与推送，切换与清单动作只做 IPC 转发。
 * connectByAddress 按地址可达、握手识别、条目落位、切换同步四阶段推进，
 * 各阶段失败都有明确的错误码供界面提示。
 * 设备探测只在清单可见期间运行，探测结论与连接事实共同决定状态点颜色。
 */

import { useEffect } from 'react';
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

/** 当前主机的实时通道状态，来自 WebSocket 客户端的连接回调 */
export type WsLinkStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting';

/** 单台设备的探测超时，几秒内无回应即判连不上 */
const PROBE_TIMEOUT_MS = 5000;

/** 清单可见期间的探测轮询间隔 */
const PROBE_INTERVAL_MS = 30_000;

interface ConnectionState {
  /** 当前连接事实快照，null 表示尚未初始化 */
  snapshot: ConnectionSnapshot | null;
  /** 设备清单镜像，来自主进程 devices.json */
  devices: DeviceEntry[];
  /** 探测结论，hostId 到能否连上的映射，缺项表示还没查过 */
  probes: Record<string, boolean>;
  /** 当前主机的实时通道状态，null 表示尚未上报，中途断开靠它转红 */
  currentWsStatus: WsLinkStatus | null;
  /** 切换进行中 */
  switching: boolean;
  /** 新建连接的推进阶段，非 idle 时按钮转圈 */
  connectStage: ConnectStage;
  /** 新建连接的失败原因，idle 时清空 */
  connectError: ConnectError | null;
  /** 记录当前主机的通道状态，由 WebSocket 客户端的连接回调推进 */
  setCurrentWsStatus: (status: WsLinkStatus) => void;
  /** 探测单台设备，握手即探测，身份不符也算连不上 */
  probeDevice: (hostId: string) => Promise<void>;
  /** 探测全部设备并按间隔轮询，返回停止函数，清单关闭时调用 */
  startProbing: () => () => void;
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
  probes: {},
  currentWsStatus: null,
  switching: false,
  connectStage: 'idle',
  connectError: null,

  setCurrentWsStatus: (status) => set({ currentWsStatus: status }),

  probeDevice: async (hostId) => {
    const { devices, probes } = get();
    const entry = devices.find((d) => d.hostId === hostId);
    // 本机跟随服务进程状态，没有地址的条目无从探测
    if (!entry || entry.hostId === LOCAL_DEVICE_ID || !entry.address) return;
    let reachable = false;
    try {
      const info = await fetchHandshake(entry.address, PROBE_TIMEOUT_MS);
      reachable = info.hostId === hostId;
    } catch {
      reachable = false;
    }
    // 结论没变时不写状态不打日志，轮询期间保持安静
    if (probes[hostId] === reachable) return;
    set({ probes: { ...probes, [hostId]: reachable } });
    if (reachable) {
      logger.info(`[DeviceProbe] ${hostId} reachable at ${entry.address}`);
    } else {
      logger.warn(`[DeviceProbe] ${hostId} unreachable at ${entry.address}`);
    }
  },

  startProbing: () => {
    const probeAll = () => {
      for (const device of get().devices) {
        void get().probeDevice(device.hostId);
      }
    };
    probeAll();
    const timer = setInterval(probeAll, PROBE_INTERVAL_MS);
    logger.info('[DeviceProbe] Round probing started');
    return () => {
      clearInterval(timer);
      logger.info('[DeviceProbe] Round probing stopped');
    };
  },

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
        // 失败后马上补查这一台，状态点红绿立见分晓
        if (hostId !== LOCAL_DEVICE_ID) {
          void get().probeDevice(hostId);
        }
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
      // 已有条目只吃地址，初始名传空串表示不适用
      hostName: '',
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

/** 显示名顺序：本地标签优先，hostId 前几位兜底 */
export function deviceDisplayName(entry: DeviceEntry): string {
  return entry.name ?? entry.hostId.slice(0, 8);
}

/** 状态点四态，绿检查过能连上，红检查过连不上，黄连接进行中，灰还不知道 */
export type DeviceDotStatus = 'online' | 'connecting' | 'offline' | 'unknown';

/**
 * 条目状态点，回答这台设备现在能不能连上。
 * 本机跟随本机服务进程状态，当前主机跟随实时通道状态，
 * 其余设备看探测结论，没查过或没有地址都算不知道。
 */
export function deviceStatus(
  entry: DeviceEntry,
  snapshot: ConnectionSnapshot | null,
  probes: Record<string, boolean>,
  currentWsStatus: WsLinkStatus | null
): DeviceDotStatus {
  if (entry.hostId === LOCAL_DEVICE_ID) {
    const local = snapshot?.local.status;
    if (local === 'connected') return 'online';
    if (local === 'connecting') return 'connecting';
    if (local === 'disconnected') return 'offline';
    return 'unknown';
  }
  const isCurrent =
    !!snapshot &&
    (entry.hostId === snapshot.current.hostId ||
      entry.hostId === currentDeviceKey(snapshot));
  if (isCurrent) {
    const link = currentWsStatus ?? snapshot.current.status;
    if (link === 'connected') return 'online';
    if (link === 'connecting' || link === 'reconnecting') return 'connecting';
    return 'offline';
  }
  if (!entry.address) return 'unknown';
  const reachable = probes[entry.hostId];
  if (reachable === undefined) return 'unknown';
  return reachable ? 'online' : 'offline';
}

/** 当前设备解析结论，条目为 null 表示清单尚未就绪 */
export interface CurrentDevice {
  entry: DeviceEntry | null;
  remote: boolean;
}

/** 从清单与快照解析当前设备，本机连接归位为 local，快照未就绪视为本机 */
export function currentDeviceOf(
  devices: DeviceEntry[],
  snapshot: ConnectionSnapshot | null
): CurrentDevice {
  if (!snapshot) return { entry: null, remote: false };
  const key = currentDeviceKey(snapshot);
  return {
    entry: devices.find((d) => d.hostId === key) ?? null,
    remote: key !== LOCAL_DEVICE_ID,
  };
}

/**
 * 当前设备订阅钩子，归属标记与角标共用。
 * find 返回清单既有对象，引用稳定不会引发多余渲染。
 */
export function useCurrentDevice(): CurrentDevice {
  const devices = useConnectionStore((s) => s.devices);
  const snapshot = useConnectionStore((s) => s.snapshot);
  return currentDeviceOf(devices, snapshot);
}

/**
 * 清单可见期间驱动探测的钩子，挂载即查一轮并按间隔轮询，卸载即停。
 * 调用方必须随清单开挂载卸载，常驻组件里挂它会让轮询永不停止。
 */
export function useDeviceProbing(): void {
  useEffect(() => useConnectionStore.getState().startProbing(), []);
}
