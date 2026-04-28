/**
 * @file src/renderer/stores/viewStore.ts
 * @description 主窗口视图状态管理，控制当前显示聊天界面还是设置页面
 */
import { create } from 'zustand';

type ViewType = 'chat' | 'settings';

interface ViewStore {
  currentView: ViewType;
  setView: (view: ViewType) => void;
}

export const useViewStore = create<ViewStore>()((set) => ({
  currentView: 'chat',
  setView: (view) => set({ currentView: view }),
}));
