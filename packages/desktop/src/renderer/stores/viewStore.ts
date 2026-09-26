/**
 * @file src/renderer/stores/viewStore.ts
 * @description 主窗口视图状态管理，控制全局视图切换以及 MainView 内部导航、侧边栏折叠
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../lib/logger';
import type { LandingMode } from '../lib/landing';

/** 全局视图：设置页、商城与聊天页互斥切换 */
type ViewType = 'chat' | 'settings' | 'marketplace';

/** MainView 内部导航，在 chat 视图下按 activeNav 切换右侧内容区 */
type MainNav = 'chat' | 'agent-settings' | 'tools' | 'skills';

/** 设置页左侧导航 tab */
export type SettingsTab = 'general' | 'providers' | 'voice' | 'mcp' | 'skills';

/** 向导打开状态：agentId 为空表示不弹，mode 区分首启与重放 */
interface LandingState {
  agentId: string | null;
  mode: LandingMode;
}

interface ViewStore {
  currentView: ViewType;
  editingAgentId: string | null;
  activeNav: MainNav;
  /**
   * 设置页当前 tab，离开设置页再回来时保持在原 tab。
   * 不进 partialize，跨应用重启回落 general。
   */
  settingsTab: SettingsTab;
  sessionSidebarCollapsed: boolean;
  /**
   * 会话侧边栏宽度（占 Group 的百分比，15–30）。
   * 与 minSize/maxSize 保持一致，避免 Panel 警告并保证拖拽范围。
   */
  sessionSidebarWidth: number;
  /** 不进 partialize，跨应用重启保持关闭 */
  landing: LandingState;

  setView: (view: ViewType) => void;
  setActiveNav: (nav: MainNav) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  toggleSessionSidebar: () => void;
  /**
   * 幂等写入会话侧边栏收起态。
   * 拖拽分隔条触发库自动收起时由 App 反向同步，TitleBar 图标随之翻转。
   */
  setSessionSidebarCollapsed: (collapsed: boolean) => void;
  setSessionSidebarWidth: (width: number) => void;
  openAgentEditor: (agentId: string | null) => void;
  closeAgentEditor: () => void;
  openLanding: (agentId: string, mode: LandingMode) => void;
  closeLanding: () => void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      currentView: 'chat',
      editingAgentId: null,
      activeNav: 'chat',
      settingsTab: 'general',
      sessionSidebarCollapsed: false,
      sessionSidebarWidth: 20,
      landing: { agentId: null, mode: 'first-run' },

      setView: (view) => set({ currentView: view }),
      setActiveNav: (nav) => set({ activeNav: nav }),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
      toggleSessionSidebar: () =>
        set((s) => ({ sessionSidebarCollapsed: !s.sessionSidebarCollapsed })),
      setSessionSidebarCollapsed: (collapsed) =>
        set({ sessionSidebarCollapsed: collapsed }),
      setSessionSidebarWidth: (width) => set({ sessionSidebarWidth: width }),

      /**
       * 打开 Agent 编辑器，仅切换 activeNav。
       * currentView 不变，始终是 'chat'。
       */
      openAgentEditor: (agentId) =>
        set({
          editingAgentId: agentId,
          activeNav: 'agent-settings',
        }),
      closeAgentEditor: () =>
        set({
          editingAgentId: null,
          activeNav: 'chat',
        }),

      /**
       * 打开向导。首启由 App 的门控触发，重放由设置页入口触发，共用此 action。
       */
      openLanding: (agentId, mode) => {
        logger.info(`[Landing] wizard opened: mode=${mode}, agent=${agentId}`);
        set({ landing: { agentId, mode } });
      },
      /**
       * 关闭向导且不落任何持久标记，重放取消后下次启动不会意外弹窗。
       */
      closeLanding: () => {
        logger.info('[Landing] wizard closed');
        set({ landing: { agentId: null, mode: 'first-run' } });
      },
    }),
    {
      name: 'view-store',
      partialize: (s) => ({
        sessionSidebarCollapsed: s.sessionSidebarCollapsed,
        sessionSidebarWidth: s.sessionSidebarWidth,
      }),
    }
  )
);
