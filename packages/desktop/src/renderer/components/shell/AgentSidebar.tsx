/**
 * @file src/renderer/components/shell/AgentSidebar.tsx
 * @description 左侧 Agent 列表侧边栏，展示所有 Agent 头像、添加按钮、服务管理和设置入口。
 * 选中态使用 framer-motion 共享布局动画，切换 Agent 时白色卡片和蓝色竖条弹性滑动。
 */
import React, { useState } from 'react';
import { Settings, Plus, Compass, MonitorSmartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import { useTunnelStore } from '../../stores/tunnelStore';
import { AgentAvatar } from '../common/AgentAvatar';
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

/** 左下角图标五色态 */
type IconStatus =
  | 'server_down'
  | 'tunnel_off'
  | 'tunnel_unhealthy'
  | 'waiting_for_mobile'
  | 'all_good';

const iconConfig: Record<IconStatus, { color: string; titleKey: string }> = {
  server_down: { color: 'text-red-400', titleKey: 'server.disconnected' },
  tunnel_off: { color: 'text-gray-400', titleKey: 'server.tunnelNotStarted' },
  tunnel_unhealthy: {
    color: 'text-orange-500',
    titleKey: 'server.tunnelUnreachable',
  },
  waiting_for_mobile: {
    color: 'text-yellow-500',
    titleKey: 'server.waitingForPhone',
  },
  all_good: { color: 'text-green-500', titleKey: 'server.allConnected' },
};

/**
 * 根据本地连接、隧道状态、健康度和手机在线状态推导图标状态。
 * 判断优先级：本地服务器 > 隧道开启 > 隧道健康 > 手机在线
 */
function deriveIconStatus(
  connectionStatus: 'connected' | 'connecting' | 'disconnected',
  tunnelStatus: string,
  tunnelHealth: string,
  mobileOnline: boolean
): IconStatus {
  if (connectionStatus !== 'connected') return 'server_down';
  if (tunnelStatus !== 'running') return 'tunnel_off';
  if (tunnelHealth === 'unhealthy') return 'tunnel_unhealthy';
  if (!mobileOnline) return 'waiting_for_mobile';
  return 'all_good';
}

/**
 * Agent 列表侧边栏组件，渲染 Agent 头像列表并提供切换和添加操作。
 * 选中 Agent 时通过 framer-motion layoutId 实现弹性滑动切换动画。
 * @param props.connectionStatus - 当前后端服务连接状态
 */
export const AgentSidebar: React.FC<AgentSidebarProps> = ({
  connectionStatus,
}) => {
  const { t } = useTranslation();
  const { agents, currentAgent, switchAgent } = useAgentStore();
  const { currentView, setView, openAgentEditor } = useViewStore();
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const tunnelStatus = useTunnelStore((s) => s.status);
  const tunnelHealth = useTunnelStore((s) => s.health);
  const mobileOnline = useTunnelStore((s) => s.mobileDeviceIds.size > 0);

  const iconStatus = deriveIconStatus(
    connectionStatus,
    tunnelStatus,
    tunnelHealth,
    mobileOnline
  );
  const config = iconConfig[iconStatus];

  /** 点击 Agent 头像切换到对应 Agent，如果在非聊天视图则同时切回聊天 */
  const handleAgentClick = async (id: string) => {
    if (currentView !== 'chat') {
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
          onClick={() => setView('marketplace')}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors',
            currentView === 'marketplace'
              ? 'bg-background shadow-inner'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <Compass className="w-5 h-5" />
        </button>
        <button
          onClick={() => setServerModalOpen(true)}
          title={t(config.titleKey)}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors',
            'text-muted-foreground hover:bg-muted'
          )}
        >
          <MonitorSmartphone className={cn('w-5 h-5', config.color)} />
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
              ? 'bg-background shadow-inner'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
