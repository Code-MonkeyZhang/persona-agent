/**
 * @file stores/configStore.ts
 * @description 全局应用配置状态管理，负责从后端加载、保存及就地修改 Agent 运行配置
 */

import { create } from 'zustand';
import { getConfig, updateConfig } from '../lib/api';

interface RetryConfig {
  enabled: boolean;
  maxRetries: number;
}

interface MCPConfig {
  connectTimeout: number;
  executeTimeout: number;
}

interface ToolsConfig {
  skillsDir: string;
  mcpConfigPath: string;
  mcp: MCPConfig;
}

export interface AgentConfig {
  apiKey: string;
  apiBase: string;
  model: string;
  provider: 'anthropic' | 'openai';
  enableLogging: boolean;
  retry: RetryConfig;
  maxSteps: number;
  systemPromptPath: string;
  tools: ToolsConfig;
}

interface ConfigState {
  config: AgentConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  loadConfig: () => Promise<void>;
  saveConfig: (config: AgentConfig) => Promise<void>;
  updateField: <K extends keyof AgentConfig>(
    field: K,
    value: AgentConfig[K]
  ) => void;
  updateNestedField: (path: string, value: unknown) => void;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  loading: false,
  saving: false,
  error: null,

  /**
   * 从后端拉取完整的 Agent 配置并写入本地状态
   */
  loadConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await getConfig();
      set({ config, loading: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load config';
      set({ error: errorMessage, loading: false });
    }
  },

  /**
   * 将完整配置提交到后端持久化，成功后同步更新本地状态
   * @param config - 要保存的完整 AgentConfig 对象
   * @throws 后端保存失败时抛出异常
   */
  saveConfig: async (config: AgentConfig) => {
    set({ saving: true, error: null });
    try {
      await updateConfig(config);
      set({ config, saving: false });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to save config';
      set({ error: errorMessage, saving: false });
      throw error;
    }
  },

  /**
   * 更新配置中的顶层字段，仅修改本地状态不触发后端保存
   * @param field - 要修改的 AgentConfig 字段名
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

  /**
   * 更新配置中的嵌套字段，通过点分隔路径定位，仅修改本地状态不触发后端保存
   * @param path - 点分隔的属性路径，如 "mcp.connectTimeout"
   * @param value - 新值
   */
  updateNestedField: (path, value) => {
    const { config } = get();
    if (!config) return;

    const newConfig = { ...config };
    const keys = path.split('.');
    let current: Record<string, unknown> = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (key) {
        current[key] = { ...(current[key] as Record<string, unknown>) };
        current = current[key] as Record<string, unknown>;
      }
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }

    set({ config: newConfig });
  },
}));
