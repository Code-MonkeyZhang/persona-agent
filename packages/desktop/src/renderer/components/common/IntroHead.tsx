/**
 * @file src/renderer/components/common/IntroHead.tsx
 * @description 详情头部，行首图标盒、名字、简介与作者，行尾可放动作
 * MCP、内置工具与技能的详情头部共用，图标盒与行尾动作由调用方给
 */

import type { ReactNode } from 'react';

interface IntroHeadProps {
  icon: ReactNode;
  name: string;
  desc?: string;
  author?: string;
  /** 行尾动作插槽，如详情头部的打开目录按钮 */
  action?: ReactNode;
}

export function IntroHead({
  icon,
  name,
  desc,
  author,
  action,
}: IntroHeadProps) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-body font-bold text-foreground">{name}</h3>
        {desc && (
          <p className="mt-0.5 text-caption text-muted-foreground">{desc}</p>
        )}
        {author && (
          <p className="mt-0.5 text-micro text-muted-foreground">@{author}</p>
        )}
      </div>
      {action}
    </div>
  );
}
