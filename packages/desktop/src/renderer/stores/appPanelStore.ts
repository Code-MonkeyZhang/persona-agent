/**
 * @file stores/appPanelStore.ts
 * @description 小手机预览屏的领域状态。
 * 管理 Agent App 清单加载与当前打开的应用，面板可见性与宽度归 viewStore。
 */

import { create } from 'zustand';
import { listMcpServers } from '../lib/api';
import { logger } from '../lib/logger';

/** Agent App 条目，name 是机器键，logoUrl 为带内容哈希的协议地址 */
export interface AppInfo {
  name: string;
  displayName: string;
  logoUrl?: string;
}

interface AppPanelState {
  apps: AppInfo[];
  /** 当前打开的应用名，null 表示桌面态 */
  selectedApp: string | null;

  loadApps: () => Promise<void>;
  selectApp: (name: string | null) => void;
}

export const useAppPanelStore = create<AppPanelState>()((set) => ({
  apps: [],
  selectedApp: null,

  loadApps: async () => {
    try {
      const servers = await listMcpServers();
      const agentApps = servers
        .filter((s) => s.agentApp)
        .map((s) => ({
          name: s.name,
          displayName: s.displayName,
          logoUrl: s.logoUrl,
        }));
      set({ apps: agentApps });
      logger.info('AppPanel: loaded agent apps', {
        count: agentApps.length,
      });
    } catch (err) {
      logger.error('AppPanel: failed to load agent apps', err);
    }
  },

  selectApp: (name) => set({ selectedApp: name }),
}));
