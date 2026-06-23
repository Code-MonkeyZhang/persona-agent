/**
 * @file src/renderer/components/ui/CollapsibleSection.tsx
 * @description 可折叠分区组件，点击标题栏展开/折叠内容区域，带 chevron 旋转和高度过渡动画
 */

import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CollapsibleSectionProps {
  /** 分区标题 */
  title: string;
  /** 分区内项目数量，显示在标题右侧 */
  count: number;
  /** 当前是否展开 */
  open: boolean;
  /** 切换展开/折叠 */
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * 可折叠分区，标题栏含 chevron + 标题 + 数量。
 * 折叠时 chevron 旋转 -90°，内容区通过 grid-template-rows 0fr→1fr 过渡实现高度动画。
 */
export function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-1 py-2 text-left"
      >
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200',
            !open && '-rotate-90'
          )}
        />
        <span className="text-[13px] font-medium text-muted-foreground">
          {title}
        </span>
        <span className="text-[11px] text-muted-foreground/60">({count})</span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </div>
  );
}
