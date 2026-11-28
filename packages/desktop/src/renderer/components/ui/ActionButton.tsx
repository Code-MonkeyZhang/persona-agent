/**
 * @file src/renderer/components/ui/ActionButton.tsx
 * @description 设置行里的行内操作按钮
 * 通用 Button 最小一档高 36 像素，比设置行的最小高度 32 像素还高，放进行里显得大。
 * 这里把高度收成 28 像素，和行内其它小控件同高，字号按设计规范走 text-body。
 */

import { Button, type ButtonProps } from './Button';
import { cn } from '../../lib/utils';

/** variant 沿用 Button 的取值，outline 是描边，default 是实心主色，secondary 是浅底 */
export function ActionButton({ className, ...props }: ButtonProps) {
  return (
    <Button
      size="sm"
      className={cn('h-7 px-2.5 text-body', className)}
      {...props}
    />
  );
}
