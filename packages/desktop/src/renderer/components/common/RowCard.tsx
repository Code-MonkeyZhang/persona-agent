/**
 * @file src/renderer/components/common/RowCard.tsx
 * @description 列表详情类页面的行壳，选中时左缘亮 primary 竖条并带底色
 */

import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** 选中态指示条与行底色的公共类名 */
const ROW_BASE =
  'group relative w-full flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left';

interface RowCardProps {
  selected: boolean;
  /** 停用置灰，行整体降低不透明度 */
  dimmed?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function RowCard({ selected, dimmed, onClick, children }: RowCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        ROW_BASE,
        selected ? 'bg-muted' : 'hover:bg-muted',
        dimmed && 'opacity-50'
      )}
    >
      {selected && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r" />
      )}
      {children}
    </div>
  );
}
