/**
 * @file src/renderer/components/settings/McpListTab.tsx
 * @description 设置页 MCP 标签页外壳：标题 + "打开目录"按钮 + 管理行列表。
 * 列出全部 MCP 服务（含 Agent App）。
 * 状态、OAuth、卸载数据与逻辑都在 useMarketplaceStore，行渲染用 ManageRow（行内二次确认）。
 */

import React, { useEffect } from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { ListState } from '../common/ListState';
import { ManageRow } from './ManageRow';
import { dataPath } from '../../lib/platform';

export const McpListTab: React.FC = () => {
  const { t } = useTranslation();
  const mcpServers = useMarketplaceStore((s) => s.mcpServers);
  const isLoading = useMarketplaceStore((s) => s.mcpManageLoading);
  const error = useMarketplaceStore((s) => s.mcpManageError);
  const authorizing = useMarketplaceStore((s) => s.authorizing);
  const loadMcpManage = useMarketplaceStore((s) => s.loadMcpManage);
  const authorizeMcp = useMarketplaceStore((s) => s.authorizeMcp);
  const disposeOAuth = useMarketplaceStore((s) => s.disposeOAuth);
  const uninstallMcpItem = useMarketplaceStore((s) => s.uninstallMcpItem);

  useEffect(() => {
    loadMcpManage();
    return () => disposeOAuth();
  }, [loadMcpManage, disposeOAuth]);

  return (
    <ListState isLoading={isLoading} error={error} onRetry={loadMcpManage}>
      <div className="p-5">
        <div className="rounded-xl border border-border bg-white px-4 py-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[14px] font-bold text-foreground">
              {t('mcp.title')}
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
            {t('mcp.desc')}
          </p>

          {mcpServers.length === 0 ? (
            <div className="text-placeholder text-[13px] py-4 text-center">
              {t('mcp.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {mcpServers.map((mcp) => (
                <ManageRow
                  key={mcp.name}
                  type="mcp"
                  mcp={mcp}
                  authorizing={authorizing === mcp.name}
                  onAuthorize={() => authorizeMcp(mcp.name)}
                  onUninstall={() => uninstallMcpItem(mcp.name)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </ListState>
  );
};
