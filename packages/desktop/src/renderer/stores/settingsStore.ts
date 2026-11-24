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
  /** 陪伴立绘的呼吸动画开关，默认开启，关闭后立绘完全静止，按设备本地存不进服务端 */
  breathEnabled: boolean;
  /** 思考气泡开关，默认开启，关闭后生成期间头顶不再冒思考气泡，情绪气泡不受影响，按设备本地存不进服务端 */
  thinkingBubbleEnabled: boolean;
  setThoughtProcessVisible: (visible: boolean) => void;
  setBreathEnabled: (enabled: boolean) => void;
  setThinkingBubbleEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      thoughtProcessVisible: true,
      breathEnabled: true,
      thinkingBubbleEnabled: true,

      setThoughtProcessVisible: (visible) => {
        set({ thoughtProcessVisible: visible });
        logger.info(`[Settings] thought process visibility: ${visible}`);
      },

      setBreathEnabled: (enabled) => {
        set({ breathEnabled: enabled });
        logger.info(`[Settings] breath animation: ${enabled}`);
      },

      setThinkingBubbleEnabled: (enabled) => {
        set({ thinkingBubbleEnabled: enabled });
        logger.info(`[Settings] thinking bubble: ${enabled}`);
      },
    }),
    {
      name: 'settings-store',
      partialize: (state) => ({
        thoughtProcessVisible: state.thoughtProcessVisible,
        breathEnabled: state.breathEnabled,
        thinkingBubbleEnabled: state.thinkingBubbleEnabled,
      }),
    }
  )
);
