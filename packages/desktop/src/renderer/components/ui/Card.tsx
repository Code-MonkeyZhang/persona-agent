/**
 * @file src/renderer/components/ui/Card.tsx
 * @description 通用设置卡片容器，统一圆角白卡片 + 粗体标题的外观
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CardProps {
  title: string;
  icon?: LucideIcon;
  desc?: string;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 设置卡片容器：圆角白卡片，顶部粗体标题。
 * - icon 渲染为标题左侧的小号灰色图标
 * - desc 渲染在标题下方的小号灰色说明行
 * - action 渲染在标题行右侧，与标题同行排布
 * 间距规则：有 desc 时标题行下留 mb-1、desc 下留 mb-4，否则标题行下留 mb-3。
 * @param title - 卡片标题
 * @param icon - 可选的标题图标组件
 * @param desc - 可选的标题下说明文字
 * @param action - 可选的标题行右侧操作区
 * @param className - 追加到容器根节点的样式类
 * @param children - 卡片内容
 */
export const Card: React.FC<CardProps> = ({
  title,
  icon,
  desc,
  action,
  className,
  children,
}) => {
  const Icon = icon;
  const titleNode = (
    <h3
      className={cn(
        'text-[14px] font-bold text-foreground',
        !action && (desc ? 'mb-1' : 'mb-3')
      )}
    >
      {Icon && (
        <Icon className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
      )}
      {title}
    </h3>
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-background px-4 py-4',
        className
      )}
    >
      {action ? (
        <div
          className={cn(
            'flex items-center justify-between',
            desc ? 'mb-1' : 'mb-3'
          )}
        >
          {titleNode}
          {action}
        </div>
      ) : (
        titleNode
      )}
      {desc && <p className="text-[12px] text-muted-foreground mb-4">{desc}</p>}
      {children}
    </div>
  );
};
