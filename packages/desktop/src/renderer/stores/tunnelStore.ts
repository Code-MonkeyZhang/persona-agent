/**
 * @file src/renderer/stores/tunnelStore.ts
 * @description 隧道（tunnel）状态管理，控制隧道的启动/停止/状态轮询
 */
import { create } from 'zustand';
import { startTunnel, stopTunnel, getTunnelStatus } from '../lib/api';
import { logger } from '../lib/logger';

type TunnelStatus = 'stopped' | 'starting' | 'running' | 'error';

interface TunnelStore {
  status: TunnelStatus;
  url: string | null;
  error: string | null;
  isModalOpen: boolean;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setModalOpen: (open: boolean) => void;

  startPolling: () => void;
  stopPolling: () => void;
}

let pollingTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 隧道状态 store
 * 管理隧道生命周期，启动时自动轮询状态直到就绪或出错
 */
export const useTunnelStore = create<TunnelStore>((set, get) => ({
  status: 'stopped',
  url: null,
  error: null,
  isModalOpen: false,

  /**
   * 启动隧道，开始轮询状态
   */
  start: async () => {
    const { status } = get();
    if (status === 'starting' || status === 'running') return;

    set({ status: 'starting', error: null });
    try {
      await startTunnel();
      get().startPolling();
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
      set({ status: 'stopped', url: null, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to stop tunnel',
      });
    }
  },

  /**
   * 从后端获取最新隧道状态，若非 starting 状态则停止轮询
   */
  refreshStatus: async () => {
    try {
      const data = await getTunnelStatus();
      set({ status: data.status, url: data.url, error: data.error });

      if (data.status !== 'starting') {
        get().stopPolling();
      }
    } catch (err) {
      logger.error('[TunnelStore] refreshStatus failed:', err);
      get().stopPolling();
    }
  },

  setModalOpen: (open: boolean) => {
    set({ isModalOpen: open });
  },

  /**
   * 每秒轮询一次隧道状态
   */
  startPolling: () => {
    if (pollingTimer) return;
    pollingTimer = setInterval(() => {
      get().refreshStatus();
    }, 1000);
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
