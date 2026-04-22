/**
 * @file stores/providerStore.ts
 * @description LLM 供应商凭证状态管理，支持加载、保存、验证和批量提交 API Key
 */

import { create } from 'zustand';
import {
  listProviders,
  setCredential as apiSetCredential,
  verifyCredential as apiVerifyCredential,
  deleteCredential as apiDeleteCredential,
  type ProviderInfo,
  type VerifyResult,
} from '../lib/api';

interface ProviderStore {
  providers: ProviderInfo[];
  isLoading: boolean;
  error: string | null;
  verifyingProvider: string | null;
  pendingCredentials: Map<string, string>;

  loadProviders: () => Promise<void>;
  setCredential: (provider: string, apiKey: string) => Promise<boolean>;
  verifyCredential: (
    provider: string,
    apiKey?: string
  ) => Promise<VerifyResult>;
  deleteCredential: (provider: string) => Promise<boolean>;
  setPendingCredential: (provider: string, apiKey: string) => void;
  clearPendingCredential: (provider: string) => void;
  saveAllPending: () => Promise<void>;
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: [],
  isLoading: false,
  error: null,
  verifyingProvider: null,
  pendingCredentials: new Map(),

  /**
   * 从后端获取所有供应商信息，按已认证优先排序后写入本地状态
   */
  loadProviders: async () => {
    set({ isLoading: true, error: null });
    try {
      const providers = await listProviders();
      const sorted = providers.sort((a, b) => {
        return a.hasAuth === b.hasAuth ? 0 : a.hasAuth ? -1 : 1;
      });
      set({ providers: sorted, isLoading: false });
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to load providers',
        isLoading: false,
      });
    }
  },

  /**
   * 将指定供应商的 API Key 提交到后端保存，成功后清除待提交缓存并刷新供应商列表
   * @param provider - 供应商标识
   * @param apiKey - API Key 明文
   * @returns 保存成功返回 true，失败返回 false
   */
  setCredential: async (provider: string, apiKey: string) => {
    set({ error: null });
    try {
      await apiSetCredential(provider, apiKey);
      const pending = new Map(get().pendingCredentials);
      pending.delete(provider);
      set({ pendingCredentials: pending });
      await get().loadProviders();
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to set credential',
      });
      return false;
    }
  },

  /**
   * 向后端验证指定供应商的 API Key 是否有效，验证通过后清除待提交缓存并刷新列表
   * @param provider - 供应商标识
   * @param apiKey - 可选的 API Key；不传则验证后端已存储的凭证
   * @returns 验证结果，包含 valid 标志和可选的 error 信息
   */
  verifyCredential: async (provider: string, apiKey?: string) => {
    set({ verifyingProvider: provider, error: null });
    try {
      const result = await apiVerifyCredential(provider, apiKey);
      if (result.valid) {
        const pending = new Map(get().pendingCredentials);
        pending.delete(provider);
        set({ pendingCredentials: pending });
        await get().loadProviders();
      }
      return result;
    } catch (error) {
      const result: VerifyResult = {
        valid: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to verify credential',
      };
      set({ error: result.error });
      return result;
    } finally {
      set({ verifyingProvider: null });
    }
  },

  /**
   * 删除指定供应商已保存的凭证，成功后刷新供应商列表
   * @param provider - 供应商标识
   * @returns 删除成功返回 true，失败返回 false
   */
  deleteCredential: async (provider: string) => {
    set({ error: null });
    try {
      await apiDeleteCredential(provider);
      const pending = new Map(get().pendingCredentials);
      pending.delete(provider);
      set({ pendingCredentials: pending });
      await get().loadProviders();
      return true;
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete credential',
      });
      return false;
    }
  },

  /**
   * 将指定供应商的 API Key 暂存到待提交缓存，不立即调用后端
   * @param provider - 供应商标识
   * @param apiKey - API Key 明文
   */
  setPendingCredential: (provider: string, apiKey: string) => {
    const pending = new Map(get().pendingCredentials);
    pending.set(provider, apiKey);
    set({ pendingCredentials: pending });
  },

  /**
   * 清除指定供应商的待提交缓存
   * @param provider - 供应商标识
   */
  clearPendingCredential: (provider: string) => {
    const pending = new Map(get().pendingCredentials);
    pending.delete(provider);
    set({ pendingCredentials: pending });
  },

  /**
   * 将所有待提交缓存中的 API Key 并行提交到后端保存
   */
  saveAllPending: async () => {
    const pending = get().pendingCredentials;
    if (pending.size === 0) return;

    const promises: Promise<boolean>[] = [];
    pending.forEach((apiKey, provider) => {
      promises.push(get().setCredential(provider, apiKey));
    });

    await Promise.all(promises);
  },
}));
