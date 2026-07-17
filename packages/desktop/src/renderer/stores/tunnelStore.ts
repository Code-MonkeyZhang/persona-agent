/**
 * @file src/renderer/stores/tunnelStore.ts
 * @description 隧道状态管理，控制隧道的启动/停止/状态轮询，跟踪隧道健康度和手机在线状态
 */
import { create } from 'zustand';
import { startTunnel, stopTunnel, getTunnelStatus } from '../lib/api';
import { logger } from '../lib/logger';

type TunnelStatus = 'stopped' | 'starting' | 'running' | 'error';
type TunnelHealth = 'unknown' | 'healthy' | 'unhealthy';

/** starting 阶段的快速轮询间隔 */
const FAST_POLL_INTERVAL = 1000;
/** running 阶段的慢速轮询间隔，与服务端健康检测间隔对齐 */
const SLOW_POLL_INTERVAL = 60_000;

interface TunnelStore {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
  health: TunnelHealth;
  /** 在线手机设备的 deviceId 集合，size > 0 表示有手机连接 */
  mobileDeviceIds: Set<string>;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  addMobileDevice: (deviceId: string) => void;
  removeMobileDevice: (deviceId: string) => void;

  startPolling: (interval: number) => void;
  stopPolling: () => void;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 隧道状态 store
 * 管理隧道生命周期和在线设备跟踪
 * starting 时快速轮询，running 时切换为慢速轮询持续监控
 */
export const useTunnelStore = create<TunnelStore>((set, get) => ({
  status: 'stopped',
  url: null,
  error: null,
  health: 'unknown',
  mobileDeviceIds: new Set<string>(),

  /**
   * 启动隧道，开始快速轮询状态
   */
  start: async () => {
    const { status } = get();
    if (status === 'starting' || status === 'running') return;

    set({ status: 'starting', error: null });
    try {
      await startTunnel();
      get().startPolling(FAST_POLL_INTERVAL);
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to start tunnel',
      });
    }
  },

  /**
   * 停止隧道并清理轮询
   */
  stop: async () => {
    get().stopPolling();
    try {
      await stopTunnel();
      set({
        status: 'stopped',
        url: null,
        error: null,
        health: 'unknown',
        mobileDeviceIds: new Set(),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to stop tunnel',
      });
    }
  },

  /**
   * 从后端获取最新隧道状态。
   * starting 时保持快速轮询，running 时切换为慢速轮询，其他状态停止轮询。
   * 同时从 onlineDevices 重建手机在线列表。
   */
  refreshStatus: async () => {
    try {
      const data = await getTunnelStatus();
      const mobileIds = new Set(
        (data.onlineDevices ?? [])
          .filter((d) => d.deviceType === 'mobile')
          .map((d) => d.deviceId)
      );
      set({
        status: data.status,
        url: data.url,
        error: data.error,
        health: data.health,
        mobileDeviceIds: mobileIds,
      });

      if (data.status === 'starting') {
        if (!pollingTimer) {
          get().startPolling(FAST_POLL_INTERVAL);
        }
      } else if (data.status === 'running') {
        get().stopPolling();
        get().startPolling(SLOW_POLL_INTERVAL);
      } else {
        get().stopPolling();
      }
    } catch (err) {
      logger.error('[TunnelStore] refreshStatus failed:', err);
      get().stopPolling();
    }
  },

  addMobileDevice: (deviceId: string) => {
    set((state) => {
      if (state.mobileDeviceIds.has(deviceId)) return state;
      const ids = new Set(state.mobileDeviceIds);
      ids.add(deviceId);
      logger.info(`[TunnelStore] Mobile device online: ${deviceId}`);
      return { mobileDeviceIds: ids };
    });
  },

  removeMobileDevice: (deviceId: string) => {
    set((state) => {
      if (!state.mobileDeviceIds.has(deviceId)) return state;
      const ids = new Set(state.mobileDeviceIds);
      ids.delete(deviceId);
      logger.info(`[TunnelStore] Mobile device offline: ${deviceId}`);
      return { mobileDeviceIds: ids };
    });
  },

  /**
   * 以指定间隔启动轮询定时器
   */
  startPolling: (interval: number = FAST_POLL_INTERVAL) => {
    if (pollingTimer) return;
    pollingTimer = setInterval(() => {
      get().refreshStatus();
    }, interval);
  },

  /**
   * 停止轮询定时器
   */
  stopPolling: () => {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  },
}));
