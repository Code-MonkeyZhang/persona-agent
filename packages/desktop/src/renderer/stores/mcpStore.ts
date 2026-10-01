/**
 * @file src/renderer/stores/mcpStore.ts
 * @description MCP 服务的统一管理状态。
 * 列表数据只有 listMcpServers 一份，OAuth 授权轮询与卸载编排放这里，
 * 工具页与设置页 MCP 管理共用，商城 store 不再持有这段逻辑。
 */

import { create } from 'zustand';
import {
  listMcpServers,
  startMcpOAuth,
  getMcpOAuthStatus,
  reconnectMcp,
  uninstallMcp,
  type McpServerInfo,
} from '../lib/api';
import { useAppPanelStore } from './appPanelStore';
import { logger } from '../lib/logger';
import { toast } from './toastStore';
import i18n from '../i18n';

const OAUTH_POLL_INTERVAL_MS = 2000;
const OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface McpStore {
  /** null 表示尚未完成首次加载 */
  servers: McpServerInfo[] | null;
  loading: boolean;
  error: string | null;
  /** 正在走 OAuth 授权的服务名 */
  authorizing: string | null;
  /** 正在重连的服务名 */
  retrying: string | null;
  load: () => Promise<void>;
  authorize: (name: string) => Promise<void>;
  /** 页面卸载时停止轮询并清授权态 */
  disposeOAuth: () => void;
  /** 连接失败后的重连，详情页状态行的重试按钮调用 */
  retry: (name: string) => Promise<void>;
  uninstall: (name: string) => Promise<void>;
}

let oauthPollHandle: ReturnType<typeof setInterval> | null = null;
let oauthPollStart = 0;

function stopOAuthPoll() {
  if (oauthPollHandle) {
    clearInterval(oauthPollHandle);
    oauthPollHandle = null;
  }
}

export const useMcpStore = create<McpStore>((set, get) => ({
  servers: null,
  loading: false,
  error: null,
  authorizing: null,
  retrying: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const servers = await listMcpServers();
      set({ servers, loading: false });
    } catch (err) {
      logger.error('[Mcp] Failed to load servers:', err);
      set({
        error: err instanceof Error ? err.message : i18n.t('common.loadFailed'),
        loading: false,
      });
    }
  },

  /**
   * 发起 OAuth 授权。
   * 打开浏览器授权页后每两秒轮询状态，连上或超时收尾并刷新列表。
   */
  authorize: async (name) => {
    if (get().authorizing) return;
    set({ authorizing: name });
    logger.info(`[Mcp] Starting OAuth for ${name}`);
    try {
      const result = await startMcpOAuth(name);
      if (!result.authorizationUrl) {
        set({ authorizing: null });
        await get().load();
        return;
      }
      await window.api?.openExternal(result.authorizationUrl);
      oauthPollStart = Date.now();
      oauthPollHandle = setInterval(async () => {
        try {
          const status = await getMcpOAuthStatus(name);
          if (status.status === 'connected') {
            stopOAuthPoll();
            set({ authorizing: null });
            logger.info(`[Mcp] OAuth connected for ${name}`);
            await get().load();
          } else if (status.status === 'needs_auth' && status.error) {
            stopOAuthPoll();
            set({ authorizing: null });
            logger.error(`[Mcp] OAuth failed for ${name}:`, status.error);
            await get().load();
          } else if (Date.now() - oauthPollStart > OAUTH_POLL_TIMEOUT_MS) {
            stopOAuthPoll();
            set({ authorizing: null });
            logger.warn(`[Mcp] OAuth timed out for ${name}`);
          }
        } catch {
          stopOAuthPoll();
          set({ authorizing: null });
        }
      }, OAUTH_POLL_INTERVAL_MS);
    } catch (err) {
      stopOAuthPoll();
      set({ authorizing: null });
      const msg =
        err instanceof Error ? err.message : i18n.t('common.loadFailed');
      logger.error(`[Mcp] OAuth start failed for ${name}:`, msg);
      toast.error(msg);
    }
  },

  disposeOAuth: () => {
    stopOAuthPoll();
    set({ authorizing: null });
  },

  /** 连接失败后的重连，成功与否都刷新列表，失败时提示 */
  retry: async (name) => {
    if (get().retrying) return;
    set({ retrying: name });
    logger.info(`[Mcp] Reconnecting ${name}`);
    try {
      await reconnectMcp(name);
      await get().load();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('common.loadFailed');
      logger.error(`[Mcp] Failed to reconnect ${name}:`, msg);
      toast.error(msg);
      await get()
        .load()
        .catch(() => {});
    } finally {
      set({ retrying: null });
    }
  },

  /**
   * 卸载一个 MCP 服务并刷新列表。
   * Agent App 卸载有图标栏联动，正开着该 App 的面板时一并收起。
   */
  uninstall: async (name) => {
    logger.info(`[Mcp] Uninstalling ${name}`);
    try {
      await uninstallMcp(name);
      await get().load();
      const appPanel = useAppPanelStore.getState();
      if (appPanel.apps.some((a) => a.name === name)) {
        if (appPanel.selectedApp === name) appPanel.selectApp(null);
        await appPanel.loadApps();
        logger.info(`[Mcp] Refreshed app icon bar after ${name} uninstall`);
      }
      toast.success(i18n.t('marketplace.uninstallSuccess', { name }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('common.loadFailed');
      logger.error(`[Mcp] Failed to uninstall ${name}:`, msg);
      toast.error(msg);
    }
  },
}));
