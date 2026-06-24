/**
 * @file src/renderer/components/TitleBar.tsx
 * @description 全宽顶部状态条，统一承载窗口控制和 Session 栏收起/展开开关。
 * 整栏可拖拽移动窗口，按钮区域不可拖拽。
 * macOS 使用系统原生红绿灯，Windows/Linux 自绘红绿灯。
 */
import React from 'react';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useViewStore } from '../stores/viewStore';
import { WindowControls } from './WindowControls';
import { isMac } from '../lib/platform';

/**
 * 顶部状态条组件。
 * 左侧为窗口红绿灯 + Session 栏开关，仅 chat 视图时显示开关。
 */
export const TitleBar: React.FC = () => {
  const { t } = useTranslation();
  const currentView = useViewStore((s) => s.currentView);
  const sessionSidebarCollapsed = useViewStore(
    (s) => s.sessionSidebarCollapsed
  );
  const toggleSessionSidebar = useViewStore((s) => s.toggleSessionSidebar);

  const showSessionToggle = currentView === 'chat';

  return (
    <div className="h-9 shrink-0 flex items-center bg-muted border-b border-border header-drag select-none">
      <div
        className="header-no-drag flex items-center"
        style={{ paddingLeft: isMac ? '70px' : '12px', gap: '12px' }}
      >
        {/* Windows/Linux 自绘红绿灯；macOS 使用系统原生红绿灯，不渲染 */}
        {!isMac && <WindowControls />}
        {showSessionToggle && (
          <button
            onClick={toggleSessionSidebar}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={
              sessionSidebarCollapsed
                ? t('common.expandSidebar')
                : t('common.collapseSidebar')
            }
          >
            {sessionSidebarCollapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </div>
  );
};
