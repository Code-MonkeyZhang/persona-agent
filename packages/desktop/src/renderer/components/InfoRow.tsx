/**
 * @file components/InfoRow.tsx
 * @description 通用信息行组件，用于展示图标 + 标签 + 值 + 可选复制按钮
 */

import React from 'react';
import { CopyButton } from './ui/CopyButton';

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  copyable?: boolean;
}

/**
 * 信息行组件，点击复制按钮可将值写入剪贴板
 */
export const InfoRow: React.FC<InfoRowProps> = ({
  icon,
  label,
  value,
  copyable,
}) => {
  return (
    <div className="flex items-center gap-2 text-[14px]">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono text-[13px] text-foreground">
        {value}
      </span>
      {copyable && <CopyButton text={value} />}
    </div>
  );
};
