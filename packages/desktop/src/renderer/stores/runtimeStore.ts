/**
 * @file src/renderer/stores/runtimeStore.ts
 * @description 工具运行环境的状态仓库。uv 的检测结果和安装进度在这里合一，挂在应用根部，任何页面都能读，切页面不影响它。
 * 状态只有两个来源，接口查询和 WebSocket 的 runtime_install 事件。
 * 安装从进行中变成结束或失败的那一刻弹 Toast，用户停在哪个页面都看得见。
 */

import { create } from 'zustand';
import type {
  RuntimeInstallError,
  RuntimeInstallState,
  ServerMessage,
  UvStatus,
} from '@persona/shared';
import { getRuntimeStatus, startRuntimeInstall } from '../lib/api';
import { logger } from '../lib/logger';
import i18n from '../i18n';
import { toast } from './toastStore';

/** 环境这一行的四个显示态，loading 是检测结果还没到 */
export type UvState = 'loading' | 'ready' | 'missing' | 'installing';

/** 失败类别到文案键的映射，结束时弹的 Toast 与描述行的文案共用 */
export const FAILED_KEY: Record<RuntimeInstallError, string> = {
  network: 'config.uvFailedNetwork',
  slow: 'config.uvFailedSlow',
  server: 'config.uvFailedServer',
  corrupted: 'config.uvFailedCorrupted',
  unsupported: 'config.uvFailedUnsupported',
  local: 'config.uvFailedLocal',
};

/** 查不到检测结果时用的值，按未安装显示 */
const DETECTION_FAILED: UvStatus = { ok: false, source: null, path: null };

/**
 * 由数据推导显示态。
 * 进行中的安装最优先，其次是带着失败类别的未安装，再是检测结果，检测结果还没到就是检测中。
 */
export function deriveUvState(
  uv: UvStatus | null,
  install: RuntimeInstallState | null
): UvState {
  if (install?.status === 'running') return 'installing';
  if (install?.status === 'failed') return 'missing';
  if (uv === null) return 'loading';
  return uv.ok ? 'ready' : 'missing';
}

interface RuntimeStore {
  /** uv 的检测结果，null 表示还没查到 */
  uv: UvStatus | null;
  /** 进行中或者刚失败的那一次安装，null 表示没有 */
  install: RuntimeInstallState | null;
  /** 每来一条推送加一，用来丢弃比推送旧的查询和发起响应 */
  version: number;

  refresh: () => Promise<void>;
  start: () => Promise<void>;
  handleWsMessage: (msg: ServerMessage) => void;
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  uv: null,
  install: null,
  version: 0,

  /**
   * 向服务端查询并覆盖本地状态，不弹提示。
   * 查不到就落回未安装并且清掉安装状态，这一行不会停在检测中。
   */
  refresh: async () => {
    const version = get().version;
    let next: Pick<RuntimeStore, 'uv' | 'install'>;
    try {
      const status = await getRuntimeStatus();
      next = { uv: status.uv, install: status.install };
    } catch (err) {
      logger.warn('[RuntimeStore] refresh failed:', err);
      next = { uv: DETECTION_FAILED, install: null };
    }
    // 请求在途时来过推送，这份响应比推送旧，丢弃
    if (get().version === version) set(next);
  },

  /**
   * 发起安装。进行中时直接返回，不再发请求，请求本身失败时弹网络不通那一句。
   */
  start: async () => {
    if (get().install?.status === 'running') return;
    const previous = get().install;
    const version = get().version;
    // 先把这一行变成安装中，按钮立刻点不动，之后的状态以服务端的推送为准
    set({
      install: { status: 'running', step: 'uv', received: 0, total: null },
    });
    try {
      const status = await startRuntimeInstall();
      if (get().version === version) {
        set({ uv: status.uv, install: status.install });
      }
    } catch (err) {
      logger.error('[RuntimeStore] start failed:', err);
      // 中途来过推送说明服务端其实收到了请求，以推送为准
      if (get().version !== version) return;
      set({ install: previous });
      toast.error(i18n.t(FAILED_KEY.network));
    }
  },

  /**
   * 只认 runtime_install 一种消息。
   * 上一次是进行中而这一次变成结束或者失败时弹 Toast，别的变化只更新状态。
   */
  handleWsMessage: (msg) => {
    if (msg.type !== 'runtime_install') return;
    const wasRunning = get().install?.status === 'running';
    const { install } = msg;

    // 先把序号加一，在途的查询和发起的响应都比这条推送旧，到达时会被丢弃
    set((state) => ({
      version: state.version + 1,
      install,
      // 装完以后检测结果要重新查，先把 uv 置空，这一行先显示检测中，查到结果才变成已就绪
      uv: install === null ? null : state.uv,
    }));

    if (install?.status === 'failed' && wasRunning) {
      toast.error(i18n.t(FAILED_KEY[install.error]));
    } else if (install === null && wasRunning) {
      toast.success(i18n.t('config.uvInstalled'));
    }
    if (install === null) void get().refresh();
  },
}));
