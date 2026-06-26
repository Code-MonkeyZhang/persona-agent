/**
 * @file src/renderer/components/McpListTab.tsx
 * @description 设置页 MCP 标签页外壳：标题 + "打开目录"按钮 + 卡片列表。
 * 卡片逻辑（状态、OAuth、卸载）在 McpCardList 组件中，与 McpView 共用。
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { McpCardList } from './McpCardList';

export const McpListTab: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="p-5">
      <div className="rounded-xl border border-border bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-bold text-foreground">
            {t('mcp.title')}
          </h3>
          <button
            onClick={() =>
              window.api?.openPath('~/.local/share/persona-agent/mcp/')
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground border border-border bg-white hover:bg-secondary transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            {t('common.openDirectory')}
          </button>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4">
          {t('mcp.desc')}
        </p>
        <McpCardList />
      </div>
    </div>
  );
};
