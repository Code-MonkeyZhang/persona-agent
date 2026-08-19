/**
 * @file src/renderer/components/ui/StatusDot.tsx
 * @description 状态圆点组件，统一各处状态指示圆点的尺寸
 */

import { cn } from '../../lib/utils';

interface StatusDotProps {
  color: string;
  className?: string;
}

/**
 * 状态圆点，固定 w-2 h-2 rounded-full shrink-0 尺寸，颜色由 color 指定
 */
export function StatusDot({ color, className }: StatusDotProps) {
  return (
    <span className={cn('w-2 h-2 rounded-full shrink-0', color, className)} />
  );
}
