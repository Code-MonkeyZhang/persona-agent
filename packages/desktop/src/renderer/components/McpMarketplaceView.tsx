/**
 * @file components/McpMarketplaceView.tsx
 * @description MCP 商城浏览视图。从 sidebar → MCP 管理页头部的"浏览商城"按钮进入。
 * 卡片显示 logo + 名字 + 简介 + 安装按钮。一键安装，无表单。
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Download, Check, Loader2, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  listMarketplaceMcps,
  installMarketplaceMcp,
  listMcpServers,
  type McpMarketplaceItem,
} from '../lib/api';
import { useViewStore } from '../stores/viewStore';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';
import { folderNameOf } from '../lib/marketplace';
import { BackButton } from './ui/BackButton';
import { ListState } from './ListState';
import { MarketplaceLogo } from './MarketplaceLogo';

export const McpMarketplaceView: React.FC = () => {
  const { t } = useTranslation();
  const setActiveNav = useViewStore((s) => s.setActiveNav);

  const [entries, setEntries] = useState<McpMarketplaceItem[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [remote, local] = await Promise.all([
        listMarketplaceMcps(),
        listMcpServers(),
      ]);
      setEntries(remote);
      setInstalledNames(new Set(local.map((m) => m.name)));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('mcpMarketplace.loadFailed')
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInstall = async (entry: McpMarketplaceItem) => {
    const name = folderNameOf(entry);
    setInstalling((prev) => new Set(prev).add(name));
    try {
      await installMarketplaceMcp(name);
      setInstalledNames((prev) => new Set(prev).add(name));
      toast.success(t('mcpMarketplace.installSuccess', { name: entry.name }));
    } catch (err) {
      logger.error('Failed to install MCP:', err);
      toast.error(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-muted">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* 标题 + 返回 */}
        <div className="flex items-center gap-2 mb-1">
          <BackButton onClick={() => setActiveNav('tools')} />
          <h1 className="text-[16px] font-bold text-foreground">
            {t('mcpMarketplace.title')}
          </h1>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4 ml-6">
          {t('mcpMarketplace.desc')}
        </p>

        {/* 列表 */}
        <ListState isLoading={isLoading} error={error} onRetry={load}>
          <div className="grid grid-cols-2 gap-2.5">
            {entries.map((entry) => {
              const name = folderNameOf(entry);
              const isInstalled = installedNames.has(name);
              const isInstalling = installing.has(name);

              return (
                <div
                  key={name}
                  className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
                >
                  {/* logo + 名字 */}
                  <div className="flex items-start gap-2.5">
                    <MarketplaceLogo
                      logoUrl={entry.logoUrl}
                      name={entry.name}
                      fallbackIcon={Wrench}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground truncate">
                        {entry.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 truncate">
                        @{entry.author}
                      </div>
                    </div>
                  </div>
                  {/* 简介 */}
                  <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed min-h-[28px]">
                    {entry.description}
                  </p>
                  {/* 操作区 */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => window.api?.openExternal(entry.homepage)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
                      title={t('mcpMarketplace.homepage')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1" />
                    {isInstalled ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted text-muted-foreground text-[12px]">
                        <Check className="w-3.5 h-3.5" />
                        {t('mcpMarketplace.installed')}
                      </span>
                    ) : isInstalling ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-50 text-blue-600 text-[12px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('mcpMarketplace.installing')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInstall(entry)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-[12px] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('mcpMarketplace.install')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ListState>
      </div>
    </div>
  );
};
