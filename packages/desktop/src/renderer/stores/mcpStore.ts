/**
 * @file src/renderer/stores/mcpStore.ts
 * @description MCP 服务的统一管理状态。
 * 列表与条目加载带响应次序护栏，只放行最新一次响应；
 * 分配写入点击先乐观翻转并按条目单飞，在途乐观值补丁到落地清单，成功与失败都重拉对账。
 * OAuth 授权轮询与卸载编排放这里，
 * 工具页与设置页 MCP 管理共用，商城 store 不再持有这段逻辑。
 */

import { create } from 'zustand';
import {
  listMcpServers,
  listTools,
  assignTool,
  startMcpOAuth,
  getMcpOAuthStatus,
  reconnectMcp,
  uninstallMcp,
  type McpServerInfo,
  type ToolEntryInfo,
} from '../lib/api';
import { useAppPanelStore } from './appPanelStore';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';
import { LoadGuard } from '../lib/loadGuard';
import { toast } from './toastStore';
import i18n from '../i18n';

const OAUTH_POLL_INTERVAL_MS = 2000;
const OAUTH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 在途乐观值补丁到落地清单上。
 * 写径未完成前，先出发的旧快照可能晚到，乐观值比它新，落地时按条目覆盖回去。
 */
function patchPending(
  entries: ToolEntryInfo[],
  assigning: Map<string, boolean>
): ToolEntryInfo[] {
  if (assigning.size === 0) {
    return entries;
  }
  return entries.map((entry) => {
    const pending = assigning.get(entry.id);
    return pending === undefined ? entry : { ...entry, assigned: pending };
  });
}

interface McpStore {
  /** null 表示尚未完成首次加载 */
  servers: McpServerInfo[] | null;
  loading: boolean;
  error: string | null;
  /** 正在走 OAuth 授权的服务名 */
  authorizing: string | null;
  /** 正在重连的服务名 */
  retrying: string | null;
  /** 工具注册表条目，工具页左栏与详情共用 */
  entries: ToolEntryInfo[] | null;
  /** 条目加载出错信息，与 servers 的 error 分开记 */
  entriesError: string | null;
  /** 最近一次条目加载用的 agentId，变更事件重拉时复用 */
  lastAgentId: string | undefined;
  /** 写分配在途的条目，键为条目 id 值为乐观 assigned 值，列表行读它锁开关 */
  assigning: Map<string, boolean>;
  load: () => Promise<void>;
  /** 拉工具注册表条目，带分配标记与立绘可见性 */
  loadTools: (agentId?: string) => Promise<void>;
  /** 写一条分配记录，内置开关与外部加减号共用 */
  setAssignment: (
    agentId: string,
    entryId: string,
    assigned: boolean
  ) => Promise<void>;
  authorize: (name: string) => Promise<void>;
  /** 页面卸载时停止轮询并清授权态 */
  disposeOAuth: () => void;
  /** 连接失败后的重连，详情页状态行的重试按钮调用 */
  retry: (name: string) => Promise<void>;
  uninstall: (name: string) => Promise<void>;
}

let oauthPollHandle: ReturnType<typeof setInterval> | null = null;
let oauthPollStart = 0;

/** load 与 loadTools 各自的响应次序护栏，过期响应整段丢弃 */
const serversGuard = new LoadGuard();
const toolsGuard = new LoadGuard();

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
  entries: null,
  entriesError: null,
  lastAgentId: undefined,
  assigning: new Map(),

  load: async () => {
    const ticket = serversGuard.begin();
    set({ loading: true, error: null });
    try {
      const servers = await listMcpServers();
      if (!serversGuard.isCurrent(ticket)) {
        logger.info('[Mcp] Dropped a stale load response');
        return;
      }
      set({ servers, loading: false });
    } catch (err) {
      if (!serversGuard.isCurrent(ticket)) {
        return;
      }
      logger.error('[Mcp] Failed to load servers:', err);
      set({
        error: getErrorMessage(err, i18n.t('common.loadFailed')),
        loading: false,
      });
    }
  },

  loadTools: async (agentId) => {
    const ticket = toolsGuard.begin();
    set({ entriesError: null, lastAgentId: agentId });
    try {
      const entries = await listTools(agentId, i18n.language);
      if (!toolsGuard.isCurrent(ticket)) {
        logger.info('[Tools] Dropped a stale loadTools response');
        return;
      }
      set({ entries: patchPending(entries, get().assigning) });
    } catch (err) {
      if (!toolsGuard.isCurrent(ticket)) {
        return;
      }
      logger.error('[Tools] Failed to load entries:', err);
      set({
        entriesError: getErrorMessage(err, i18n.t('common.loadFailed')),
      });
    }
  },

  /**
   * 写一条分配记录。
   * 点击先本地乐观翻转并按条目单飞，在途期间落地的条目清单被乐观值补丁；
   * 成功与失败都整份重拉对账，服务端永远是真相来源，落盘产生的
   * agents_invalidated 与 tools_invalidated 事件再驱动各端对齐。
   */
  setAssignment: async (agentId, entryId, assigned) => {
    if (get().assigning.has(entryId)) return;
    logger.info('[Tools] Assignment write', { agentId, entryId, assigned });
    set((state) => {
      const assigning = new Map(state.assigning).set(entryId, assigned);
      if (!state.entries) {
        return { assigning };
      }
      return {
        assigning,
        entries: state.entries.map((entry) =>
          entry.id === entryId ? { ...entry, assigned } : entry
        ),
      };
    });
    try {
      await assignTool(agentId, entryId, assigned);
    } catch (err) {
      const msg = getErrorMessage(err, i18n.t('tools.assignFailed'));
      logger.error('[Tools] Failed to write assignment:', msg);
      toast.error(msg);
      // 失败先撤乐观标记，随后的重拉才能带回未打补丁的真相
      set((state) => {
        const next = new Map(state.assigning);
        next.delete(entryId);
        return { assigning: next };
      });
    }
    // 成功对账失败回真相，都整份重拉
    await get().loadTools(get().lastAgentId);
    set((state) => {
      const next = new Map(state.assigning);
      next.delete(entryId);
      return { assigning: next };
    });
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
      const msg = getErrorMessage(err, i18n.t('common.loadFailed'));
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
      const msg = getErrorMessage(err, i18n.t('common.loadFailed'));
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
   * Agent App 卸载联动预览屏，正开着该 App 时清掉打开态并重拉清单。
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
        logger.info(`[Mcp] Refreshed phone panel apps after ${name} uninstall`);
      }
      toast.success(i18n.t('marketplace.uninstallSuccess', { name }));
    } catch (err) {
      const msg = getErrorMessage(err, i18n.t('common.loadFailed'));
      logger.error(`[Mcp] Failed to uninstall ${name}:`, msg);
      toast.error(msg);
    }
  },
}));
