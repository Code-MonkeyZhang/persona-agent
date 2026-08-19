/**
 * @file stores/appPanelStore.ts
 * @description Agent App 图标栏与 WebView 面板的共享状态。
 * 管理 App 列表加载、选中 App、面板折叠/展开、图标栏可见性。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listMcpServers } from '../lib/api';
import { logger } from '../lib/logger';

interface AppInfo {
  name: string;
}

interface AppPanelState {
  apps: AppInfo[];
  selectedApp: string | null;
  panelCollapsed: boolean;
  sidebarVisible: boolean;

  loadApps: () => Promise<void>;
  selectApp: (name: string | null) => void;
  collapsePanel: () => void;
  toggleSidebar: () => void;
}

export const useAppPanelStore = create<AppPanelState>()(
  persist(
    (set) => ({
      apps: [],
      selectedApp: null,
      panelCollapsed: true,
      sidebarVisible: true,

      loadApps: async () => {
        try {
          const servers = await listMcpServers();
          const agentApps = servers
            .filter((s) => s.agentApp)
            .map((s) => ({ name: s.name }));
          set({ apps: agentApps });
          logger.info('AppPanel: loaded agent apps', {
            count: agentApps.length,
          });
        } catch (err) {
          logger.error('AppPanel: failed to load agent apps', err);
        }
      },

      selectApp: (name) =>
        set({ selectedApp: name, panelCollapsed: name === null }),

      collapsePanel: () => set({ panelCollapsed: true }),

      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
    }),
    {
      name: 'app-panel-store',
      partialize: (s) => ({ sidebarVisible: s.sidebarVisible }),
    }
  )
);
