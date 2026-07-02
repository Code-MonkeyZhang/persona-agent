/**
 * @file src/renderer/components/ui/ScrollArea.tsx
 * @description 滚动区域组件，封装 @radix-ui/react-scroll-area
 * 默认 type="hover"：悬停显示、移开约 50ms 自动隐藏；滚动条覆盖在内容上方，不占布局空间
 */

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '../../lib/utils';

/**
 * 纵向滚动区域
 * - ref 指向 Viewport，保持「ref 指向可滚动元素」的语义
 * - Viewport 上加 [&>div]:!block 抵消 Radix 内层包裹的 display:table 副作用，避免破坏子级 flex/grid 布局
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    scrollHideDelay={50}
    className={cn('relative overflow-hidden', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      ref={ref}
      className="h-full w-full rounded-[inherit] [&>div]:!block"
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

/** 纵向滚动条，作为 ScrollArea 内部组件使用 */
const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation="vertical"
    className={cn(
      'flex touch-none select-none transition-colors h-full w-2.5 border-l border-l-transparent p-[1px]',
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea };
