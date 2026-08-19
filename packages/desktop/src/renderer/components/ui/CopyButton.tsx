/**
 * @file src/renderer/components/ui/CopyButton.tsx
 * @description 通用复制按钮组件，点击后将文本写入剪贴板并短暂显示勾选图标
 */

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick' | 'children'
> {
  text: string;
  onCopied?: () => void;
  onError?: () => void;
  children?: (copied: boolean) => React.ReactNode;
}

/**
 * 复制按钮组件，点击后写入剪贴板，2 秒内显示勾选图标。
 * 不传 children 时默认渲染 Copy/Check 图标切换。
 */
export const CopyButton = React.forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ text, onCopied, onError, children, className, ...buttonProps }, ref) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          onCopied?.();
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          onError?.();
        });
    };

    return (
      <button
        ref={ref}
        onClick={handleCopy}
        className={className ?? 'text-muted-foreground hover:text-foreground'}
        {...buttonProps}
      >
        {children ? (
          children(copied)
        ) : copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
    );
  }
);

CopyButton.displayName = 'CopyButton';
