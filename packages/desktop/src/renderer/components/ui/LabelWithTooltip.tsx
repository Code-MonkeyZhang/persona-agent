/**
 * @file src/renderer/components/ui/LabelWithTooltip.tsx
 * @description 带帮助提示的表单字段标签
 */

import React from 'react';
import { HelpTooltip } from './HelpTooltip';

interface LabelWithTooltipProps {
  label: string;
  tooltip: string;
}

/**
 * 标签 + 问号帮助提示，用于表单字段标题。
 */
export const LabelWithTooltip: React.FC<LabelWithTooltipProps> = ({
  label,
  tooltip,
}) => {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <div className="text-[13px] text-foreground">{label}</div>
      <HelpTooltip text={tooltip} />
    </div>
  );
};
