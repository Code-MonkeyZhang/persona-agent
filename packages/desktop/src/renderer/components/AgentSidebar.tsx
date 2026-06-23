/**
 * @file src/renderer/components/AgentSidebar.tsx
 * @description 左侧 Agent 列表侧边栏，展示所有 Agent 头像、添加按钮、服务管理和设置入口。
 * 选中态使用 framer-motion 共享布局动画（layoutId），切换 Agent 时白色卡片和蓝色竖条弹性滑动。
 */
import React, { useState } from 'react';
import { Settings, Plus, Loader2, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { AgentAvatar } from './AgentAvatar';
import { ServerManagerModal } from './ServerManagerModal';

interface AgentSidebarProps {
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
}

/** 选中态白色卡片和蓝色竖条的弹簧动画参数 */
const springTransition = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 35,
};

/**
 * Agent 列表侧边栏组件，渲染 Agent 头像列表并提供切换和添加操作。
 * 选中 Agent 时通过 framer-motion layoutId 实现弹性滑动切换动画。
 * @param props.connectionStatus - 当前后端服务连接状态
 */
export const AgentSidebar: React.FC<AgentSidebarProps> = ({
  connectionStatus,
}) => {
  const { agents, currentAgent, switchAgent } = useAgentStore();
  const { currentView, setView, openAgentEditor } = useViewStore();
  const [serverModalOpen, setServerModalOpen] = useState(false);

  /** 点击 Agent 头像切换到对应 Agent，如果在设置视图则同时切回聊天 */
  const handleAgentClick = async (id: string) => {
    if (currentView === 'settings') {
      setView('chat');
    }
    await switchAgent(id);
  };

  /** 点击添加按钮，打开空白 Agent 编辑页面 */
  const handleAddClick = () => {
    openAgentEditor(null);
  };

  /** 切换到设置视图 */
  const handleOpenSettings = () => {
    setView('settings');
  };

  return (
    <aside className="w-[72px] h-full bg-muted border-r border-border flex flex-col shrink-0">
      <div className="flex-1 overflow-y-auto py-2">
        {agents.map((agent) => {
          const isSelected = currentAgent?.id === agent.id;
          return (
            <div key={agent.id} className="relative">
              <button
                onClick={() => handleAgentClick(agent.id)}
                className="w-full h-auto py-3 flex flex-col items-center relative"
              >
                {/* 选中态白色圆角卡片，通过 layoutId 在 Agent 间弹性滑动 */}
                {isSelected && (
                  <motion.div
                    layoutId="agent-selected-bg"
                    transition={springTransition}
                    className="absolute left-0 top-2 bottom-2 right-3 rounded-r-2xl bg-background shadow-sm"
                  />
                )}
                <AgentAvatar
                  agent={agent}
                  size="md"
                  className="relative z-10"
                />
                {/* 选中态蓝色竖条，跟随卡片一起滑动 */}
                {isSelected && (
                  <motion.div
                    layoutId="agent-selected-bar"
                    transition={springTransition}
                    className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r z-10"
                  />
                )}
              </button>
            </div>
          );
        })}

        <button
          onClick={handleAddClick}
          className="w-full h-auto py-3 flex flex-col items-center text-muted-foreground"
        >
          <div className="w-10 h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </div>
        </button>
      </div>

      <div className="border-t border-border p-2 flex flex-col gap-1">
        <button
          onClick={() => setServerModalOpen(true)}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors',
            connectionStatus === 'connected' &&
              'text-green-500 hover:bg-green-50',
            connectionStatus === 'connecting' &&
              'text-yellow-500 hover:bg-yellow-50',
            connectionStatus === 'disconnected' &&
              'text-red-400 hover:bg-red-50'
          )}
        >
          {connectionStatus === 'connecting' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Bot className="w-5 h-5" />
          )}
        </button>
        <ServerManagerModal
          isOpen={serverModalOpen}
          onClose={() => setServerModalOpen(false)}
          connectionStatus={connectionStatus}
        />
        <button
          onClick={handleOpenSettings}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors',
            currentView === 'settings'
              ? 'text-blue-500 bg-blue-50'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
