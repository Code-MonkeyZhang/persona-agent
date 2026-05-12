/**
 * @file components/SessionSidebar.tsx
 * @description 会话列表侧边栏组件，按日期分组展示当前 Agent 的会话列表，支持切换、删除和重命名
 */

import React, { useEffect, useMemo } from 'react';
import { PanelLeftClose } from 'lucide-react';
import { GroupedVirtuoso } from 'react-virtuoso';
import { useSessionStore } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';
import { SessionItem } from './SessionItem';
import { AgentAvatar } from './AgentAvatar';
import type { SessionMeta } from '../types/session';

interface SessionSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

/**
 * 将会话列表按更新时间分组为"今天"、"昨天"、"更早"三组
 * @param sessions - 原始会话列表
 * @returns 按日期分组的会话列表（空组已过滤）
 */
function groupSessionsByDate(sessions: SessionMeta[]) {
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const yesterday = today - 86400000;

  const groups: { label: string; sessions: SessionMeta[] }[] = [
    { label: '今天', sessions: [] },
    { label: '昨天', sessions: [] },
    { label: '更早', sessions: [] },
  ];

  const sortedSessions = [...sessions].sort(
    (a, b) => b.updatedAt - a.updatedAt
  );

  for (const session of sortedSessions) {
    if (session.updatedAt >= today) {
      groups[0].sessions.push(session);
    } else if (session.updatedAt >= yesterday) {
      groups[1].sessions.push(session);
    } else {
      groups[2].sessions.push(session);
    }
  }

  return groups.filter((g) => g.sessions.length > 0);
}

/**
 * 会话侧边栏组件，展示当前 Agent 头像和按日期分组的会话列表
 */
export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  collapsed = false,
  onToggle,
}) => {
  const {
    sessions,
    currentSession,
    switchSession,
    deleteSessionById,
    updateSessionTitle,
    loadSessions,
  } = useSessionStore();

  const { currentAgent } = useAgentStore();

  const filteredSessions = currentAgent
    ? sessions.filter((s) => s.agentId === currentAgent.id)
    : sessions;

  const groupedSessions = useMemo(
    () => groupSessionsByDate(filteredSessions),
    [filteredSessions]
  );

  useEffect(() => {
    if (currentAgent) {
      loadSessions(currentAgent.id);
    }
  }, [currentAgent, loadSessions]);

  /** 切换到指定会话 */
  const handleSelectSession = async (id: string) => {
    if (currentAgent) {
      await switchSession(currentAgent.id, id);
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

  if (collapsed) {
    return null;
  }

  return (
    <aside
      className="h-full bg-white border-r border-gray-200 flex flex-col relative"
      style={{ width: 240 }} //TODO 迟早要变化这个东西
    >
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {currentAgent ? (
              <AgentAvatar agent={currentAgent} size="md" />
            ) : (
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium bg-gray-100 text-gray-700">
                ?
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium text-[15px] text-[#333] truncate">
                {currentAgent?.name || '未选择 Agent'}
              </div>
              <div className="text-[13px] text-[#999] truncate">
                {currentAgent?.description || ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onToggle && (
              <button
                onClick={onToggle}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                title="收起侧边栏"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {groupedSessions.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            {currentAgent ? '暂无对话记录' : '请先创建 Agent'}
          </div>
        ) : (
          <GroupedVirtuoso
            groupCounts={groupedSessions.map((g) => g.sessions.length)}
            groupContent={(index) => (
              <div className="px-2 py-1.5 text-[12px] text-[#999] bg-white">
                {groupedSessions[index].label}
              </div>
            )}
            itemContent={(index, groupIndex) => {
              const session = groupedSessions[groupIndex]?.sessions?.[index];
              if (!session) return null;
              return (
                <div className="px-2 pb-1">
                  <SessionItem
                    session={session}
                    isActive={currentSession?.id === session.id}
                    onSelect={handleSelectSession}
                    onDelete={handleDeleteSession}
                    onRename={handleRenameSession}
                  />
                </div>
              );
            }}
            overscan={200}
          />
        )}
      </div>
    </aside>
  );
};
