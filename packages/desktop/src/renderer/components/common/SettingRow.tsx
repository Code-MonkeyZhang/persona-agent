/**
 * @file src/renderer/components/common/SettingRow.tsx
 * @description 通用设置行组件，提供左标签 + 右控件的统一布局，以及细分割线
 */

import type { ReactNode } from 'react';
import { LabelWithTooltip } from './LabelWithTooltip';

interface SettingRowProps {
  label: string;
  desc?: string;
  descClassName?: string;
  tooltip?: string;
  children?: ReactNode;
}

/**
 * 设置行组件，左侧显示标签和描述，右侧放置控件。
 * 提供 tooltip 时标签由 LabelWithTooltip 渲染并附带帮助提示。
 * @param label - 设置项标签
 * @param desc - 可选的描述文字
 * @param descClassName - 描述文字的额外 className
 * @param tooltip - 可选的 tooltip 文字
 * @param children - 右侧控件区域
 */
export function SettingRow({
  label,
  desc,
  descClassName,
  tooltip,
  children,
}: SettingRowProps) {
  return (
    <div className="flex items-center justify-between min-h-[32px] gap-4">
      <div className="min-w-0">
        <LabelWithTooltip
          label={label}
          tooltip={tooltip}
          className="text-[14px] leading-[18px]"
        />
        {desc && (
          <div
            className={`text-[12px] text-muted-foreground mt-0.5 ${descClassName ?? ''}`}
          >
            {desc}
          </div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/**
 * 设置项之间的细分割线
 */
export function SettingDivider() {
  return <hr className="my-2 border-t-[0.5px] border-border" />;
}
