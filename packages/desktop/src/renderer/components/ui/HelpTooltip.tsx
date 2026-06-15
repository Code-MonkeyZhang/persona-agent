/**
 * @file src/renderer/components/ui/HelpTooltip.tsx
 * @description 通用帮助提示组件，鼠标悬浮显示提示文字
 */

import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  /** 提示文字内容 */
  text: string;
}

/**
 * 帮助提示组件，渲染一个问号图标，鼠标悬浮时显示提示气泡。
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({ text }) => {
  return (
    <span className="relative group">
      <HelpCircle className="w-3.5 h-3.5 text-[#999] cursor-help" />
      <span className="absolute left-5 top-1/2 -translate-y-1/2 w-56 px-3 py-2 text-[12px] text-[#666] bg-white border border-[#e0e0e0] rounded-lg shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10 pointer-events-none">
        {text}
      </span>
    </span>
  );
};
