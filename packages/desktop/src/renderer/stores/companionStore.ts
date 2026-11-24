/**
 * @file src/renderer/stores/companionStore.ts
 * @description Companion 面板可见性开关
 * 面板可见性通过 zustand persist 中间件持久化到 localStorage，重启后自动恢复
 * 立绘与演出的状态归 performanceStore，本店只管面板开不开
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanionStore {
  visible: boolean;
  toggleVisible: () => void;
}

export const useCompanionStore = create<CompanionStore>()(
  persist(
    (set) => ({
      visible: false,
      toggleVisible: () => set((s) => ({ visible: !s.visible })),
    }),
    {
      name: 'companion-store',
      partialize: (state) => ({ visible: state.visible }),
    }
  )
);
