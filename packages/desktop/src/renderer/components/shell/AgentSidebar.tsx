/**
 * @file src/renderer/components/shell/AgentSidebar.tsx
 * @description 左侧 Agent 列表侧边栏，展示所有 Agent 头像、添加按钮、设备入口、远程访问入口和设置入口。
 * 选中态使用 framer-motion 共享布局动画，切换 Agent 时白色卡片和蓝色竖条弹性滑动。
 * 两颗连接入口用图标本身的颜色做指示：设备图标跟当前连接且本机恒灰，路由器图标跟本机隧道。
 */
import React, { useState } from 'react';
import {
  Settings,
  Plus,
  Compass,
  MonitorSmartphone,
  Router,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import { useTunnelStore } from '../../stores/tunnelStore';
import { useChatStore } from '../../stores/chatStore';
import { useCurrentDevice } from '../../stores/connectionStore';
import { AgentAvatar } from '../common/AgentAvatar';
import { ServerManagerModal } from './ServerManagerModal';
import { DeviceListPopover } from './DeviceListPopover';
import { DeviceManageModal } from './DeviceManageModal';

interface AgentSidebarProps {}

/** 选中态白色卡片和蓝色竖条的弹簧动画参数 */
const springTransition = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 35,
};

/** 设备图标的连接取色档位，灰为本机常态，绿为远程在线，黄为连接过程，红为异常 */
type ConnTone = 'idle' | 'ok' | 'busy' | 'error';

const connToneClass: Record<ConnTone, string> = {
  idle: 'text-muted-foreground',
  ok: 'text-green-500',
  busy: 'text-yellow-500',
  error: 'text-red-500',
};

/**
 * Agent 列表侧边栏组件，渲染 Agent 头像列表并提供切换和添加操作。
 * 选中 Agent 时通过 framer-motion layoutId 实现弹性滑动切换动画。
 */
export const AgentSidebar: React.FC<AgentSidebarProps> = () => {
  const { t } = useTranslation();
  const { agents, currentAgent, switchAgent } = useAgentStore();
  const { currentView, setView, openAgentEditor } = useViewStore();
  const [devicePopoverOpen, setDevicePopoverOpen] = useState(false);
  const [deviceManageOpen, setDeviceManageOpen] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);

  const tunnelStatus = useTunnelStore((s) => s.status);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const { remote } = useCurrentDevice();

  /**
   * 设备图标的取色由本机身份与连接状态合成。
   * 本机恒灰作身份信号，远程按连接状态取色，syncing 不参与角标。
   */
  const deviceTone: ConnTone = !remote
    ? 'idle'
    : connectionStatus === 'connected'
      ? 'ok'
      : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
        ? 'busy'
        : 'error';

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
    <aside className="w-[72px] h-full bg-gradient-to-b from-muted via-muted to-muted/60 border-r border-border flex flex-col shrink-0">
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
                    className="absolute left-0 top-2 bottom-2 right-3 rounded-r-2xl bg-background shadow-soft"
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
          className="w-full h-auto py-3 flex flex-col items-center text-muted-foreground rounded-md transition-colors hover:bg-accent"
        >
          <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
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

        {/* 设备入口：图标本体颜色跟出站连接，本机恒灰，点开设备清单浮层 */}
        <div className="relative">
          <button
            onClick={() => setDevicePopoverOpen((v) => !v)}
            title={t('device.title')}
            className={cn(
              'w-full flex flex-col items-center py-2 rounded transition-colors hover:bg-muted',
              connToneClass[deviceTone]
            )}
          >
            {deviceTone === 'busy' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <MonitorSmartphone className="w-5 h-5" />
            )}
          </button>
          {devicePopoverOpen && (
            <DeviceListPopover
              onClose={() => setDevicePopoverOpen(false)}
              onOpenDeviceManage={() => setDeviceManageOpen(true)}
            />
          )}
        </div>

        {/* 远程访问入口：图标颜色跟入站隧道，本机服务端常驻随时可操作 */}
        <button
          onClick={() => setServerModalOpen(true)}
          title={t('server.remoteAccessTitle')}
          className={cn(
            'w-full flex flex-col items-center py-2 rounded transition-colors hover:bg-muted',
            tunnelStatus === 'running'
              ? 'text-green-500'
              : 'text-muted-foreground'
          )}
        >
          <Router className="w-5 h-5" />
        </button>

        <DeviceManageModal
          isOpen={deviceManageOpen}
          onClose={() => setDeviceManageOpen(false)}
        />
        <ServerManagerModal
          isOpen={serverModalOpen}
          onClose={() => setServerModalOpen(false)}
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
