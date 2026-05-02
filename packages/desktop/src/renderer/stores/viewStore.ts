/**
 * @file src/renderer/stores/viewStore.ts
 * @description 主窗口视图状态管理，控制当前显示聊天界面、设置页面还是 Agent 编辑页面
 */
import { create } from 'zustand';

type ViewType = 'chat' | 'settings' | 'agent-editor';

interface ViewStore {
  currentView: ViewType;
  editingAgentId: string | null;
  setView: (view: ViewType) => void;
  openAgentEditor: (agentId: string | null) => void;
  closeAgentEditor: () => void;
}

export const useViewStore = create<ViewStore>()((set) => ({
  currentView: 'chat',
  editingAgentId: null,
  setView: (view) => set({ currentView: view }),
  openAgentEditor: (agentId) =>
    set({ currentView: 'agent-editor', editingAgentId: agentId }),
  closeAgentEditor: () => set({ currentView: 'chat', editingAgentId: null }),
}));
