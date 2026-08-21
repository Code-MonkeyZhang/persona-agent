/**
 * @file src/renderer/components/common/LabelWithTooltip.tsx
 * @description 通用表单标签组件，可选附带帮助提示问号图标，鼠标悬浮显示气泡
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';
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
 * @param tooltip - 可选的帮助提示文字，悬浮问号图标时显示
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
        <span className="relative group">
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
          <span className="absolute left-5 top-1/2 -translate-y-1/2 w-56 px-3 py-2 text-[12px] text-muted-foreground bg-popover border border-input rounded-lg shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10 pointer-events-none">
            {tooltip}
          </span>
        </span>
      )}
    </div>
  );
};
