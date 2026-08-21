/**
 * @file src/renderer/components/ui/ActionButton.tsx
 * @description 通用小型操作按钮，带图标 + 文字
 */

import React from 'react';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

/**
 * 小型操作按钮，用于状态行或设置行内的次要操作。
 * @param icon - 按钮图标
 * @param label - 按钮文字
 * @param onClick - 点击回调
 */
export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    onClick={onClick}
    className="ml-2 flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
  >
    {icon}
    {label}
  </button>
);
