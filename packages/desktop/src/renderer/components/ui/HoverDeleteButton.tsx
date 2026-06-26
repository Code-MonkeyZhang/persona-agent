/**
 * @file src/renderer/components/ui/HoverDeleteButton.tsx
 * @description 卡片悬浮删除按钮，鼠标 hover 时显示，支持图片和标签两种风格
 */

import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

type Variant = 'dark' | 'light';

const variantStyles: Record<Variant, string> = {
  /** 图片卡片上的删除按钮，深色半透明背景 */
  dark: 'bg-black/40 hover:bg-black/60 text-white',
  /** 标签卡片上的删除按钮，浅色半透明背景 */
  light: 'bg-black/5 hover:bg-black/10 text-muted-foreground',
};

interface HoverDeleteButtonProps {
  variant?: Variant;
  className?: string;
  onClick: (e: React.MouseEvent) => void;
}

/**
 * 卡片悬浮删除按钮，固定 w-5 h-5 rounded-full 尺寸，hover 时显示 X 图标。
 * 通过 className 控制定位。
 */
export function HoverDeleteButton({
  variant = 'dark',
  className,
  onClick,
}: HoverDeleteButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-5 h-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center',
        variantStyles[variant],
        className
      )}
    >
      <X className="w-3 h-3" />
    </button>
  );
}
