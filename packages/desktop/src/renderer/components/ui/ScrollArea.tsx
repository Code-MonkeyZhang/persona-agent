/**
 * @file src/renderer/components/ui/ScrollArea.tsx
 * @description 简化版滚动区域组件，提供 relative overflow-auto 容器
 */

import * as React from 'react';
import { cn } from '../../lib/utils';

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn('relative overflow-auto', className)} {...props}>
    {children}
  </div>
));
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
