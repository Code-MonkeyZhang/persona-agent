/**
 * @file src/renderer/components/common/LabelWithTooltip.tsx
 * @description 通用表单标签组件，可选附带帮助提示问号图标
 * 问号基于 @radix-ui/react-tooltip 渲染，鼠标悬浮或键盘聚焦时显示气泡
 * 气泡经 portal 挂到页面根节点，不会被滚动容器裁切，宽度按内容自适应并设上限
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

interface LabelWithTooltipProps {
  label: string;
  tooltip?: string;
  className?: string;
}

/**
 * 标签 + 可选帮助提示问号，用于表单字段标题。
 * 字号与外边距由 className 控制，以适配不同场景。
 * @param label - 标签文字
 * @param tooltip - 可选的帮助提示文字，悬浮或键盘聚焦问号图标时显示
 * @param className - 额外的样式类，控制字号与外边距
 */
export const LabelWithTooltip: React.FC<LabelWithTooltipProps> = ({
  label,
  tooltip,
  className,
}) => {
  return (
    <div className={cn('flex items-center gap-1.5 text-foreground', className)}>
      <div>{label}</div>
      {tooltip && (
        /*
         * Provider 随问号一起渲染，组件不依赖外层提供，放进任何窗口或弹层都能用
         * 关掉可停留模式，指针离开问号气泡立即关闭，气泡只作提示不承接交互
         */
        <Tooltip.Provider delayDuration={300} disableHoverableContent>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-label={tooltip}
                className="inline-flex cursor-help rounded-full text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              {/* 气泡默认出现在问号右侧，贴近窗口边缘时自动翻转或平移 */}
              <Tooltip.Content
                side="right"
                sideOffset={6}
                collisionPadding={8}
                className="pointer-events-none z-50 max-w-[280px] rounded-lg border border-input bg-popover px-3 py-2 text-caption text-muted-foreground shadow-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
              >
                {tooltip}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </div>
  );
};
