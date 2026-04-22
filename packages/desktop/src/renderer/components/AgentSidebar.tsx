/**
 * @file src/renderer/components/AgentSidebar.tsx
 * @description 左侧 Agent 列表侧边栏，展示所有 Agent 头像、添加按钮、服务管理和设置入口
 */
import React, { useState } from 'react';
import { Settings, Plus, Loader2, Server } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAgentStore } from '../stores/agentStore';
import { AgentAvatar } from './AgentAvatar';
import { ServerManagerModal } from './ServerManagerModal';
import { isMac } from '../lib/platform';
import { logger } from '../lib/logger';

interface AgentSidebarProps {
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  onOpenAgentEditor?: (agentId: string | null) => void;
}

/**
 * Agent 列表侧边栏组件，渲染 Agent 头像列表并提供切换、编辑、添加操作
 * @param props.connectionStatus - 当前后端服务连接状态
 * @param props.onOpenAgentEditor - 打开 Agent 编辑面板的回调，传入 null 表示新建
 */
export const AgentSidebar: React.FC<AgentSidebarProps> = ({
  connectionStatus,
  onOpenAgentEditor,
}) => {
  const { agents, currentAgent, switchAgent } = useAgentStore();
  const [serverModalOpen, setServerModalOpen] = useState(false);

  /** 点击 Agent 头像切换到对应 Agent */
  const handleAgentClick = async (id: string) => {
    await switchAgent(id);
  };

  /** 点击 Agent 编辑图标，阻止事件冒泡后打开编辑面板 */
  const handleEditClick = (e: React.MouseEvent, agentId: string) => {
    e.stopPropagation();
    onOpenAgentEditor?.(agentId);
  };

  /** 点击添加按钮，打开空白 Agent 编辑面板 */
  const handleAddClick = () => {
    onOpenAgentEditor?.(null);
  };

  /** 通过 IPC 打开独立的设置窗口 */
  const handleOpenSettings = async () => {
    try {
      await window.api?.openSettingsWindow();
    } catch (error) {
      logger.error('Failed to open settings window:', error);
    }
  };

  return (
    <aside
      className="w-[72px] h-full bg-gray-50 border-r border-gray-200 flex flex-col"
      style={{ paddingTop: isMac ? 'env(titlebar-area-height, 28px)' : 0 }}
    >
      <div className="flex-1 overflow-y-auto py-2">
        {agents.map((agent) => (
          <div key={agent.id} className="relative group">
            <button
              onClick={() => handleAgentClick(agent.id)}
              className="w-full h-auto py-3 flex flex-col items-center relative hover:bg-gray-100 transition-colors"
            >
              <AgentAvatar agent={agent} size="md" />
              {currentAgent?.id === agent.id && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />
              )}
            </button>
            <button
              onClick={(e) => handleEditClick(e, agent.id)}
              className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-200 rounded flex items-center justify-center hover:bg-gray-300"
              title="编辑 Agent"
            >
              <Settings className="w-3 h-3" />
            </button>
          </div>
        ))}

        <button
          onClick={handleAddClick}
          className="w-full h-auto py-3 flex flex-col items-center text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
        </button>
      </div>

      <div className="border-t border-gray-200 p-2 flex flex-col gap-1">
        <button
          onClick={() => setServerModalOpen(true)}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors',
            connectionStatus === 'connected' &&
              'text-green-500 hover:bg-green-50',
            connectionStatus === 'connecting' &&
              'text-yellow-500 hover:bg-yellow-50',
            connectionStatus === 'disconnected' &&
              'text-gray-400 hover:bg-gray-100'
          )}
        >
          {connectionStatus === 'connecting' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Server className="w-5 h-5" />
          )}
        </button>
        <ServerManagerModal
          isOpen={serverModalOpen}
          onClose={() => setServerModalOpen(false)}
          connectionStatus={connectionStatus}
        />
        <button
          onClick={handleOpenSettings}
          className="w-full flex flex-col items-center py-2 text-gray-500 hover:bg-gray-100 rounded transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
