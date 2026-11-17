/**
 * @file stores/configStore.ts
 * @description 全局应用配置状态管理，负责从后端加载、保存及就地修改服务端 config.yaml 的镜像
 */

import { create } from 'zustand';
import { getConfig, updateConfig } from '../lib/api';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';

/** 压缩偏好，全局一份所有会话共用，两端设置页改的是同一份 */
export interface CompressionPrefs {
  autoCompress: boolean;
  threshold: number;
}

/** 服务端 config.yaml 的形状，GET 与 PUT /api/config 的载荷 */
export interface AppConfig {
  enableLogging: boolean;
  enableToolNarration: boolean;
  compression: CompressionPrefs;
}

/** 老服务端缺 compression 节时的回落值，与服务端默认一致 */
const DEFAULT_COMPRESSION: CompressionPrefs = {
  autoCompress: true,
  threshold: 100,
};

interface ConfigState {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;

  loadConfig: () => Promise<void>;
  saveConfig: (config: AppConfig) => Promise<void>;
  updateField: <K extends keyof AppConfig>(
    field: K,
    value: AppConfig[K]
  ) => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  error: null,

  /**
   * 从后端拉取完整的配置并写入本地状态，缺失节回落默认值
   */
  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await getConfig();
      set({
        config: {
          ...raw,
          compression: raw.compression ?? DEFAULT_COMPRESSION,
        },
        loading: false,
      });
    } catch (error) {
      logger.error('[ConfigStore] Failed to load config:', error);
      set({
        error: getErrorMessage(error, 'Failed to load config'),
        loading: false,
      });
    }
  },

  /**
   * 将完整配置提交到后端持久化，成功后同步更新本地状态
   * @param config - 要保存的完整 AppConfig 对象
   * @throws 后端保存失败时抛出异常
   */
  saveConfig: async (config: AppConfig) => {
    set({ error: null });
    try {
      await updateConfig(config);
      set({ config });
    } catch (error) {
      logger.error('[ConfigStore] Failed to save config:', error);
      set({ error: getErrorMessage(error, 'Failed to save config') });
      throw error;
    }
  },

  /**
   * 更新配置中的顶层字段，仅修改本地状态不触发后端保存
   * @param field - 要修改的 AppConfig 字段名
   * @param value - 新值
   */
  updateField: (field, value) => {
    const { config } = get();
    if (config) {
      set({
        config: {
          ...config,
          [field]: value,
        },
      });
    }
  },
}));
