/**
 * @file react-resizable-panels 封装
 * @description Group 与 Panel 原样透出，ResizeSeparator 预置 demo 的可拖拽竖条样式
 */
import {
  Group,
  Panel,
  Separator,
  useGroupRef,
  usePanelRef,
  type GroupProps,
  type PanelProps,
  type SeparatorProps,
} from 'react-resizable-panels';
import { cn } from '../../lib/utils';

export { Group, Panel, useGroupRef, usePanelRef };
export type { GroupProps, PanelProps };

/**
 * 可拖拽竖条：全高细线常显边界，短胶囊把手提示可抓。
 * 负右外边距把 8px 宽的透明抓取区向右叠进内容区画布，
 * 透出内容区自身底色，避免透出窗口白底在灰底视图里显形。
 * 叠右而非叠左，避免盖住会话项悬停操作钮的可点区域。
 */
export function ResizeSeparator({ className, ...props }: SeparatorProps) {
  return (
    <Separator
      className={cn('relative z-10 -mr-2 w-2 cursor-col-resize', className)}
      {...props}
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border" />
      <span className="pointer-events-none absolute left-0 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/35" />
    </Separator>
  );
}
