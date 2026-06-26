/**
 * @file src/renderer/components/ui/PasswordInput.tsx
 * @description 密码输入框组件，内置显示/隐藏切换按钮
 */

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * 密码输入框组件，右侧内置眼睛图标切换明文/密文显示。
 * 所有标准 input 属性均可透传。
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => {
  const [show, setShow] = React.useState(false);

  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? 'text' : 'password'}
        className={cn(
          'w-64 h-8 px-3 text-[13px] border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-muted-foreground pr-10',
          className
        )}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? (
          <EyeOff className="w-3.5 h-3.5" />
        ) : (
          <Eye className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';
