/**
 * @file src/renderer/components/shell/SessionSidebar.tsx
 * @description 会话列表侧边栏，展示当前 Agent 的常驻聊天入口、任务会话列表及底部资源入口。
 * 信息架构：Header → 聊天入口 → 分隔线 → 工具/技能 → 分隔线 →
 * 「会话」折叠头 → 平铺会话列表（钉底）。
 * 折叠状态由 viewStore 管理，开关位于 TitleBar。
 * 整体宽度由外层 react-resizable-panels 控制，自身使用 w-full 跟随面板实际尺寸。
 */

import React, { useEffect } from 'react';
import {
  MessageCircle,
  MessagesSquare,
  ChevronDown,
  ChevronRight,
  Wrench,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../stores/sessionStore';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import { SessionItem } from './SessionItem';
import { AgentAvatar } from '../common/AgentAvatar';
import { cn } from '../../lib/utils';

/** 底部资源导航项 */
const NavItem: React.FC<{
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg relative transition-colors',
      active
        ? 'bg-muted text-foreground'
        : 'text-muted-foreground hover:bg-muted'
    )}
  >
    {active && (
      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
    )}
    <Icon className="w-4 h-4" />
    <span className="flex-1 text-left text-sm truncate">{label}</span>
  </button>
);

/**
 * 会话列表侧边栏组件。
 * 折叠状态由 viewStore.sessionSidebarCollapsed 管理，折叠开关位于 TitleBar。
 */
export const SessionSidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    sessions,
    currentSession,
    switchSession,
    deleteSessionById,
    updateSessionTitle,
    loadSessions,
    sessionPreviews,
  } = useSessionStore();

  const { currentAgent } = useAgentStore();
  const sessionsCollapsed = useViewStore((s) => s.sessionsCollapsed);
  const toggleSessionsCollapsed = useViewStore(
    (s) => s.toggleSessionsCollapsed
  );
  const activeNav = useViewStore((s) => s.activeNav);
  const setActiveNav = useViewStore((s) => s.setActiveNav);
  const openAgentEditor = useViewStore((s) => s.openAgentEditor);

  const filteredSessions = currentAgent
    ? sessions.filter((s) => s.agentId === currentAgent.id)
    : sessions;

  const chatSession = filteredSessions.find((s) => s.id.startsWith('chat'));
  const regularSessions = filteredSessions
    .filter((s) => !s.id.startsWith('chat'))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  useEffect(() => {
    if (currentAgent) {
      loadSessions(currentAgent.id);
    }
  }, [currentAgent, loadSessions]);

  /** 切换到指定会话，并返回聊天视图 */
  const handleSelectSession = async (id: string) => {
    if (currentAgent) {
      await switchSession(currentAgent.id, id);
      setActiveNav('chat');
    }
  };

  /** 删除指定会话 */
  const handleDeleteSession = async (id: string) => {
    if (currentAgent) {
      await deleteSessionById(currentAgent.id, id);
    }
  };

  /** 重命名指定会话的标题 */
  const handleRenameSession = async (id: string, title: string) => {
    if (currentAgent) {
      await updateSessionTitle(currentAgent.id, id, title);
    }
  };

  // 本地实时补丁优先，服务端 lastMessage 兜底，均无时显示占位文案
  const chatPreview = chatSession
    ? sessionPreviews[chatSession.id] ||
      chatSession.lastMessage ||
      t('sessionSidebar.startChat')
    : '';

  return (
    <aside className="h-full w-full bg-background border-r border-border flex flex-col overflow-hidden">
      {/* - Header：Agent 信息块，整块可点击进入编辑 */}
      <div className="h-14 px-4 border-b border-border flex items-center shrink-0">
        <button
          onClick={() => currentAgent && openAgentEditor(currentAgent.id)}
          className="w-full flex items-center gap-3"
        >
          {currentAgent ? (
            <AgentAvatar agent={currentAgent} size="md" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium bg-muted text-foreground">
              ?
            </div>
          )}
          <div className="min-w-0 flex-1 text-left">
            <div className="font-medium text-[15px] text-foreground truncate">
              {currentAgent?.name || t('common.noAgentSelected')}
            </div>
            <div className="text-[13px] text-muted-foreground truncate">
              {currentAgent?.description || ''}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* - 上半固定区：聊天入口 + 分隔线 + 工具 + 技能 */}
      <div className="px-2 shrink-0">
        {/* 聊天入口，钉顶单独渲染 */}
        {chatSession && (
          <div className="pt-2">
            <button
              onClick={() => handleSelectSession(chatSession.id)}
              className={cn(
                'w-full flex items-start gap-2.5 px-3 py-2 rounded-lg relative transition-colors',
                currentSession?.id === chatSession.id && activeNav === 'chat'
                  ? 'bg-muted'
                  : 'hover:bg-muted'
              )}
            >
              {currentSession?.id === chatSession.id &&
                activeNav === 'chat' && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
                )}
              <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm text-foreground block">
                  {t('sessionSidebar.chat')}
                </span>
                <span className="text-xs text-muted-foreground truncate block">
                  {chatPreview}
                </span>
              </div>
            </button>
          </div>
        )}

        {/* 分隔线 */}
        <div className="mx-1 my-2 border-t border-border" />

        {/* 工具入口 */}
        <NavItem
          icon={Wrench}
          label={t('sessionSidebar.tools')}
          active={activeNav === 'tools'}
          onClick={() => setActiveNav('tools')}
        />

        {/* 技能入口 */}
        <NavItem
          icon={Sparkles}
          label={t('sessionSidebar.skills')}
          active={activeNav === 'skills'}
          onClick={() => setActiveNav('skills')}
        />
      </div>

      {/* - 下半区：「会话」折叠头 + 会话列表，钉底 */}
      <div className="shrink-0 px-2 pt-1">
        {/* 「会话」折叠头 */}
        <button
          onClick={toggleSessionsCollapsed}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted transition-colors"
        >
          <MessagesSquare className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 text-left text-sm text-muted-foreground truncate">
            {t('sessionSidebar.sessions')}
          </span>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-150',
              sessionsCollapsed && '-rotate-90'
            )}
          />
        </button>
      </div>

      {/* 普通会话列表，平铺无分组，折叠时 flex-grow 1→0 动画，占据底部剩余空间 */}
      <div
        className={cn(
          'min-h-0 hover-scroll px-2',
          sessionsCollapsed ? 'overflow-hidden' : 'overflow-y-auto'
        )}
        style={{
          flexGrow: sessionsCollapsed ? 0 : 1,
          flexBasis: 0,
          transition: 'flex-grow 0.3s ease-in-out',
        }}
      >
        <div className="pb-1">
          {regularSessions.length === 0 ? (
            <div className="px-7 py-3 text-xs text-muted-foreground">
              {currentAgent
                ? t('sessionSidebar.noTaskSessions')
                : t('common.noAgent')}
            </div>
          ) : (
            regularSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={
                  currentSession?.id === session.id && activeNav === 'chat'
                }
                onSelect={handleSelectSession}
                onDelete={handleDeleteSession}
                onRename={handleRenameSession}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
