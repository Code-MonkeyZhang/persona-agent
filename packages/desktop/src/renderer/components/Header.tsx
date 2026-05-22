/**
 * @file src/renderer/components/Header.tsx
 * @description 顶部标题栏，显示当前会话标题、陪伴面板切换和新对话按钮
 */
import React from 'react';
import { Plus, VenetianMask } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';
import { useCompanionStore } from '../stores/companionStore';
import { isMac } from '../lib/platform';
import { WindowControls } from './WindowControls';

interface HeaderProps {
  onNewChat: () => void;
  onToggleCompanion?: () => void;
}

/**
 * 顶部标题栏组件，显示当前会话标题，提供陪伴面板切换和新对话创建入口
 * @param props.onNewChat - 创建新对话的回调
 * @param props.onToggleCompanion - 切换陪伴面板的回调，由 App.tsx 管理关闭动画时序
 */
export const Header: React.FC<HeaderProps> = ({
  onNewChat,
  onToggleCompanion,
}) => {
  const { t } = useTranslation();
  const { currentSession } = useSessionStore();
  const { currentAgent } = useAgentStore();
  const visible = useCompanionStore((s) => s.visible);
  const handleToggle =
    onToggleCompanion ?? useCompanionStore((s) => s.toggleVisible);

  return (
    <header className="h-14 border-b border-gray-200 flex items-center justify-between bg-white">
      <div
        className="flex items-center gap-4 px-6"
        style={{ paddingLeft: isMac ? '70px' : undefined }}
      >
        <h1 className="font-medium text-[15px] text-[#333]">
          {currentSession?.title || t('header.newChat')}
        </h1>
      </div>
      <div className="header-no-drag flex items-center gap-2 pr-4">
        {currentAgent && (
          <>
            <button
              onClick={handleToggle}
              className={`inline-flex items-center justify-center h-8 px-3 text-xs rounded-xl border transition-colors ${
                visible
                  ? 'bg-[#f0e6ff] text-purple-600 border-purple-200 hover:bg-[#e6d6ff]'
                  : 'border-[#e0e0e0] text-[#666] hover:bg-[#f5f5f5] hover:text-[#333]'
              }`}
              title={
                visible ? t('header.hideCompanion') : t('header.showCompanion')
              }
            >
              <VenetianMask className="w-4 h-4 mr-1" />
              <span>{t('header.avatar')}</span>
            </button>
            <button
              onClick={onNewChat}
              className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-xl border border-[#e0e0e0] text-[#666] hover:bg-[#f5f5f5] hover:text-[#333] transition-colors"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span>{t('header.newChat')}</span>
            </button>
          </>
        )}
        <WindowControls />
      </div>
    </header>
  );
};
