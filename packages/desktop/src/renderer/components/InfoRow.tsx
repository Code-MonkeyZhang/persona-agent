/**
 * @file components/InfoRow.tsx
 * @description 通用信息行组件，用于展示图标 + 标签 + 值 + 可选复制按钮
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

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
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 text-[14px]">
      <span className="text-[#666]">{icon}</span>
      <span className="text-[#666]">{label}</span>
      <span className="ml-auto font-mono text-[13px] text-[#333]">{value}</span>
      {copyable && (
        <button onClick={handleCopy} className="text-[#999] hover:text-[#333]">
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      )}
    </div>
  );
};
