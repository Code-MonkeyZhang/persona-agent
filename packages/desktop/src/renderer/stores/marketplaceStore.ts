/**
 * @file stores/marketplaceStore.ts
 * @description 商城系统统一状态。承载三类商品(Skill / MCP / Agent)的浏览清单、安装态，
 * 以及设置页管理所需的 Skill 列表与卸载。
 *
 * 安装语义：商城的唯一入口是左下角罗盘，安装一律入全局池，不再自动分配给某个 Agent；
 * 用户装完后自行去各 Agent 的工具页/技能页勾选。Agent 安装特殊：克隆出新 Agent 并切换过去。
 */

import { create } from 'zustand';
import {
  listMarketplaceSkills,
  listMarketplaceMcps,
  listMarketplaceAgents,
  installMarketplaceSkill,
  installMarketplaceMcp,
  installMarketplaceAgent,
  uninstallSkill as apiUninstallSkill,
  listSkills,
  listMcpServers,
  type McpMarketplaceItem,
  type SkillMarketplaceItem,
  type AgentMarketplaceItem,
  type SkillInfo,
} from '../lib/api';
import { folderNameOf } from '../lib/marketplace';
import { useAgentStore } from './agentStore';
import { useAppPanelStore } from './appPanelStore';
import { useViewStore } from './viewStore';
import { logger } from '../lib/logger';
import { toast } from './toastStore';
import i18n from '../i18n';

interface MarketplaceStore {
  // —— 浏览: Skill ——
  skillEntries: SkillMarketplaceItem[];
  skillInstalled: Set<string>;
  skillLoading: boolean;
  skillError: string | null;
  // —— 浏览: MCP ——
  mcpEntries: McpMarketplaceItem[];
  mcpInstalled: Set<string>;
  mcpLoading: boolean;
  mcpError: string | null;
  // —— 浏览: Agent ——
  agentEntries: AgentMarketplaceItem[];
  agentInstalledSources: Set<string>;
  agentLoading: boolean;
  agentError: string | null;
  // 正在安装的文件夹名集合（三类共用，驱动卡片的"安装中"态）
  installing: Set<string>;

  // —— 管理: Skill ——
  skillsManage: SkillInfo[];
  skillsManageLoading: boolean;
  skillsManageError: string | null;

  // 浏览
  loadSkillMarketplace: () => Promise<void>;
  loadMcpMarketplace: () => Promise<void>;
  loadAgentMarketplace: () => Promise<void>;
  installSkill: (entry: SkillMarketplaceItem) => Promise<void>;
  installMcp: (entry: McpMarketplaceItem) => Promise<void>;
  installAgent: (entry: AgentMarketplaceItem) => Promise<void>;

  // 管理
  loadSkillManage: () => Promise<void>;
  uninstallSkillItem: (name: string) => Promise<void>;
}

export const useMarketplaceStore = create<MarketplaceStore>((set, get) => ({
  skillEntries: [],
  skillInstalled: new Set(),
  skillLoading: false,
  skillError: null,
  mcpEntries: [],
  mcpInstalled: new Set(),
  mcpLoading: false,
  mcpError: null,
  agentEntries: [],
  agentInstalledSources: new Set(),
  agentLoading: false,
  agentError: null,
  installing: new Set(),

  skillsManage: [],
  skillsManageLoading: false,
  skillsManageError: null,

  loadSkillMarketplace: async () => {
    set({ skillLoading: true, skillError: null });
    try {
      const [remote, local] = await Promise.all([
        listMarketplaceSkills(),
        listSkills(),
      ]);
      set({
        skillEntries: remote,
        skillInstalled: new Set(local.map((s) => s.name)),
        skillLoading: false,
      });
    } catch (err) {
      logger.error('[Marketplace] loadSkillMarketplace failed:', err);
      set({
        skillError:
          err instanceof Error ? err.message : i18n.t('marketplace.loadFailed'),
        skillLoading: false,
      });
    }
  },

  loadMcpMarketplace: async () => {
    set({ mcpLoading: true, mcpError: null });
    try {
      const [remote, local] = await Promise.all([
        listMarketplaceMcps(),
        listMcpServers(),
      ]);
      set({
        mcpEntries: remote,
        mcpInstalled: new Set(local.map((m) => m.name)),
        mcpLoading: false,
      });
    } catch (err) {
      logger.error('[Marketplace] loadMcpMarketplace failed:', err);
      set({
        mcpError:
          err instanceof Error ? err.message : i18n.t('marketplace.loadFailed'),
        mcpLoading: false,
      });
    }
  },

  loadAgentMarketplace: async () => {
    set({ agentLoading: true, agentError: null });
    try {
      const remote = await listMarketplaceAgents();
      // 已装判定：本地 Agent 的 marketplaceSource 与清单 source 求交集
      const sources = useAgentStore
        .getState()
        .agents.map((a) => a.marketplaceSource)
        .filter((s): s is string => !!s);
      set({
        agentEntries: remote,
        agentInstalledSources: new Set(sources),
        agentLoading: false,
      });
    } catch (err) {
      logger.error('[Marketplace] loadAgentMarketplace failed:', err);
      set({
        agentError:
          err instanceof Error ? err.message : i18n.t('marketplace.loadFailed'),
        agentLoading: false,
      });
    }
  },

  installSkill: async (entry) => {
    const folder = folderNameOf(entry);
    if (get().installing.has(folder)) return;
    set((s) => ({ installing: new Set(s.installing).add(folder) }));
    logger.info(`[Marketplace] Installing skill ${folder}`);
    try {
      await installMarketplaceSkill(folder);
      set((s) => ({ skillInstalled: new Set(s.skillInstalled).add(folder) }));
      toast.success(i18n.t('marketplace.installSuccess', { name: entry.name }));
    } catch (err) {
      logger.error(`[Marketplace] Failed to install skill ${folder}:`, err);
      toast.error(
        err instanceof Error ? err.message : i18n.t('common.loadFailed')
      );
    } finally {
      set((s) => {
        const next = new Set(s.installing);
        next.delete(folder);
        return { installing: next };
      });
    }
  },

  installMcp: async (entry) => {
    const folder = folderNameOf(entry);
    if (get().installing.has(folder)) return;
    set((s) => ({ installing: new Set(s.installing).add(folder) }));
    logger.info(`[Marketplace] Installing MCP ${folder}`);
    try {
      await installMarketplaceMcp(folder);
      set((s) => ({ mcpInstalled: new Set(s.mcpInstalled).add(folder) }));
      toast.success(i18n.t('marketplace.installSuccess', { name: entry.name }));
      // Agent App 装完即进 App 图标栏，主动刷新让图标立刻出现，不用重启
      if (entry.agentApp) {
        await useAppPanelStore.getState().loadApps();
      }
    } catch (err) {
      logger.error(`[Marketplace] Failed to install MCP ${folder}:`, err);
      toast.error(
        err instanceof Error ? err.message : i18n.t('common.loadFailed')
      );
    } finally {
      set((s) => {
        const next = new Set(s.installing);
        next.delete(folder);
        return { installing: next };
      });
    }
  },

  installAgent: async (entry) => {
    const folder = folderNameOf(entry);
    if (get().installing.has(folder)) return;
    set((s) => ({ installing: new Set(s.installing).add(folder) }));
    logger.info(`[Marketplace] Installing agent ${folder}`);
    try {
      const agent = await installMarketplaceAgent(folder);
      toast.success(i18n.t('marketplace.installSuccess', { name: entry.name }));
      // Agent 安装即克隆：刷新列表、切到新 Agent、回到聊天视图
      await useAgentStore.getState().loadAgents();
      await useAgentStore.getState().switchAgent(agent.id);
      set((s) => ({
        agentInstalledSources: new Set(s.agentInstalledSources).add(
          entry.source
        ),
      }));
      useViewStore.getState().setView('chat');
    } catch (err) {
      logger.error(`[Marketplace] Failed to install agent ${folder}:`, err);
      toast.error(
        err instanceof Error ? err.message : i18n.t('common.loadFailed')
      );
    } finally {
      set((s) => {
        const next = new Set(s.installing);
        next.delete(folder);
        return { installing: next };
      });
    }
  },

  loadSkillManage: async () => {
    set({ skillsManageLoading: true, skillsManageError: null });
    try {
      const data = await listSkills();
      set({ skillsManage: data, skillsManageLoading: false });
    } catch (err) {
      logger.error('[Marketplace] loadSkillManage failed:', err);
      set({
        skillsManageError:
          err instanceof Error ? err.message : i18n.t('skills.loadFailed'),
        skillsManageLoading: false,
      });
    }
  },

  uninstallSkillItem: async (name) => {
    logger.info(`[Marketplace] Uninstalling skill ${name}`);
    try {
      await apiUninstallSkill(name);
      await get().loadSkillManage();
      toast.success(i18n.t('marketplace.uninstallSuccess', { name }));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : i18n.t('common.loadFailed');
      logger.error(`[Marketplace] Failed to uninstall skill ${name}:`, err);
      toast.error(msg);
      throw err;
    }
  },
}));
