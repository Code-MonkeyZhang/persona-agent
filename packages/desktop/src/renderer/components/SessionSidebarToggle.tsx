/**
 * @file src/renderer/components/SessionSidebarToggle.tsx
 * @description 会话侧边栏展开/收起切换按钮组件
 */
import React from 'react';
import { Menu } from 'lucide-react';

interface SessionSidebarToggleProps {
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * 会话侧边栏展开/收起切换按钮
 * @param isOpen - 侧边栏当前是否展开
 * @param onToggle - 点击时触发的切换回调
 */
export const SessionSidebarToggle: React.FC<SessionSidebarToggleProps> = ({
  isOpen,
  onToggle,
}) => {
  return (
    <button
      onClick={onToggle}
      className={`
        absolute left-0 top-4 z-10
        flex items-center gap-1.5 p-1.5 rounded-r-lg transition-colors
        bg-white border border-l-0 border-gray-200 shadow-sm
        hover:bg-gray-100 text-gray-500 hover:text-gray-700
      `}
      title={isOpen ? '收起侧边栏' : '展开侧边栏'}
    >
      <Menu className="w-4 h-4" />
    </button>
  );
};
