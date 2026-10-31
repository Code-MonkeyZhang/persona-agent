/**
 * @file stores/settingsStore.ts
 * @description 渲染层界面偏好设置，localStorage 持久化，跨重启保留
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '../lib/logger';

interface SettingsStore {
  /** 聊天消息里「查看思考过程」入口是否显示，关掉只是不渲染入口，消息数据不动 */
  thoughtProcessVisible: boolean;
  setThoughtProcessVisible: (visible: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      thoughtProcessVisible: true,

      setThoughtProcessVisible: (visible) => {
        set({ thoughtProcessVisible: visible });
        logger.info(`[Settings] thought process visibility: ${visible}`);
      },
    }),
    {
      name: 'settings-store',
      partialize: (state) => ({
        thoughtProcessVisible: state.thoughtProcessVisible,
      }),
    }
  )
);
