/**
 * @file src/renderer/components/common/CollapsibleGroup.tsx
 * @description 通用分组折叠，radix 原语加 CSS 高度动画
 * 点击标题行整行切换展开收起，箭头随状态旋转，收起时计数仍可见
 */

import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';

interface CollapsibleGroupProps {
  label: string;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function CollapsibleGroup({
  label,
  count,
  open,
  onOpenChange,
  children,
}: CollapsibleGroupProps) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange}>
      <Collapsible.Trigger asChild>
        <button className="group flex w-full items-center gap-1.5 rounded-md px-3 pb-1 pt-3 text-left transition-colors hover:bg-muted/50">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90" />
          <span className="truncate text-body font-medium text-muted-foreground">
            {label}
          </span>
          <span className="text-micro text-muted-foreground">({count})</span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="collapsible-content">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
