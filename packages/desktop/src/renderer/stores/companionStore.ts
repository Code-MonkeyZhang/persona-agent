/**
 * @file src/renderer/stores/companionStore.ts
 * @description Companion 面板状态管理，控制显示/隐藏和姿态切换
 * 面板可见性通过 zustand persist 中间件持久化到 localStorage，重启后自动恢复
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CompanionStore {
  visible: boolean;
  currentPose: string;
  animatePose: boolean;
  toggleVisible: () => void;
  setPose: (pose: string, animate?: boolean) => void;
}

export const useCompanionStore = create<CompanionStore>()(
  persist(
    (set) => ({
      visible: false,
      currentPose: 'default',
      animatePose: false,
      toggleVisible: () => set((s) => ({ visible: !s.visible })),
      setPose: (pose: string, animate = false) =>
        set({ currentPose: pose, animatePose: animate }),
    }),
    {
      name: 'companion-store',
      partialize: (state) => ({ visible: state.visible }),
    }
  )
);
