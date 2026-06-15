/**
 * @file src/renderer/components/ui/BackButton.tsx
 * @description 返回按钮，带 header-no-drag 类名以避免 Electron 窗口拖拽区域拦截点击
 */

import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
}

/**
 * 返回按钮，左箭头图标 + header-no-drag，用于页面顶部的返回导航
 */
export function BackButton({ onClick }: BackButtonProps) {
  return (
    <button
      onClick={onClick}
      className="header-no-drag text-gray-400 hover:text-gray-600 transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
    </button>
  );
}
