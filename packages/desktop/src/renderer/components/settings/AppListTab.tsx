/**
 * @file src/renderer/components/settings/AppListTab.tsx
 * @description 设置页「应用」标签页：整机的 Agent App 安装管理（与 McpListTab 的普通工具分列）。
 * 结构仿 McpListTab：标题 + 描述 + "打开目录"按钮 + 管理行列表。
 * 数据复用 marketplaceStore 的 MCP 管理列表，前端按 agentApp 标记过滤。
 * 卸载走 uninstallMcpItem（断连 + 删配置 + 删目录，数据随删），store 负责联动图标栏。
 */

import React, { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { ListState } from '../common/ListState';
import { ManageRow } from './ManageRow';
import { dataPath } from '../../lib/platform';

export const AppListTab: React.FC = () => {
  const { t } = useTranslation();
  const mcpServers = useMarketplaceStore((s) => s.mcpServers);
  const isLoading = useMarketplaceStore((s) => s.mcpManageLoading);
  const error = useMarketplaceStore((s) => s.mcpManageError);
  const loadMcpManage = useMarketplaceStore((s) => s.loadMcpManage);
  const uninstallMcpItem = useMarketplaceStore((s) => s.uninstallMcpItem);

  useEffect(() => {
    loadMcpManage();
  }, [loadMcpManage]);

  /** 已装应用 = MCP 管理列表里带 agentApp 标记的条目 */
  const apps = mcpServers.filter((m) => m.agentApp);

  return (
    <ListState isLoading={isLoading} error={error} onRetry={loadMcpManage}>
      <div className="p-5">
        <div className="rounded-xl border border-border bg-white px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[14px] font-bold text-foreground">
              {t('appsSettings.title')}
            </h3>
            <button
              onClick={() => window.api?.openPath(dataPath('mcp'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground border border-border bg-white hover:bg-secondary transition-colors shadow-sm"
            >
              <FolderOpen className="w-4 h-4" />
              {t('common.openDirectory')}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground mb-4">
            {t('appsSettings.desc')}
          </p>

          {apps.length === 0 ? (
            <div className="text-placeholder text-[13px] py-4 text-center">
              {t('appsSettings.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {apps.map((app) => (
                <ManageRow
                  key={app.name}
                  type="mcp"
                  mcp={app}
                  authorizing={false}
                  onAuthorize={() => {}}
                  onUninstall={() => uninstallMcpItem(app.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ListState>
  );
};
