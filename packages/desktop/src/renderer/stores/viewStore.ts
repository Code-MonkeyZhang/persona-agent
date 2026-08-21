/**
 * @file src/renderer/stores/viewStore.ts
 * @description 主窗口视图状态管理，控制全局视图切换以及 MainView 内部导航、侧边栏折叠
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 全局视图：设置页、商城与聊天页互斥切换 */
type ViewType = 'chat' | 'settings' | 'marketplace';

/** MainView 内部导航，在 chat 视图下按 activeNav 切换右侧内容区 */
type MainNav = 'chat' | 'agent-settings' | 'tools' | 'skills';

interface ViewStore {
  currentView: ViewType;
  editingAgentId: string | null;
  activeNav: MainNav;
  sessionSidebarCollapsed: boolean;
  sessionsCollapsed: boolean;

  setView: (view: ViewType) => void;
  setActiveNav: (nav: MainNav) => void;
  toggleSessionSidebar: () => void;
  toggleSessionsCollapsed: () => void;
  openAgentEditor: (agentId: string | null) => void;
  closeAgentEditor: () => void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      currentView: 'chat',
      editingAgentId: null,
      activeNav: 'chat',
      sessionSidebarCollapsed: false,
      sessionsCollapsed: false,

      setView: (view) => set({ currentView: view }),
      setActiveNav: (nav) => set({ activeNav: nav }),
      toggleSessionSidebar: () =>
        set((s) => ({ sessionSidebarCollapsed: !s.sessionSidebarCollapsed })),
      toggleSessionsCollapsed: () =>
        set((s) => ({ sessionsCollapsed: !s.sessionsCollapsed })),

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
    }),
    {
      name: 'view-store',
      partialize: (s) => ({
        sessionSidebarCollapsed: s.sessionSidebarCollapsed,
      }),
    }
  )
);
