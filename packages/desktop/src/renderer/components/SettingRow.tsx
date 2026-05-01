/**
 * @file src/renderer/components/SettingRow.tsx
 * @description 通用设置行组件，提供左标签 + 右控件的统一布局，以及细分割线
 */

import type { ReactNode } from 'react';

interface SettingRowProps {
  label: string;
  desc?: string;
  children?: ReactNode;
}

/**
 * 设置行组件，左侧显示标签和描述，右侧放置控件
 * @param label - 设置项标签
 * @param desc - 可选的描述文字
 * @param children - 右侧控件区域
 */
export function SettingRow({ label, desc, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between min-h-[32px] gap-4">
      <div className="min-w-0">
        <div className="text-[14px] text-[#333] leading-[18px]">{label}</div>
        {desc && <div className="text-[12px] text-[#999] mt-0.5">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

/**
 * 设置项之间的细分割线
 */
export function SettingDivider() {
  return <hr className="my-2 border-t-[0.5px] border-[#e8e8e8]" />;
}
