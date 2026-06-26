/**
 * @file components/AgentMarketplaceView.tsx
 * @description Agent 商城浏览视图。从 AgentSidebar 底部的商城按钮进入。
 * 卡片显示 logo + 名字 + 简介 + 安装按钮。一键安装，安装后自动切换到新 Agent。
 *
 * 同一模板只能安装一次：前端并发拉远程清单 + 本地 Agent 列表，
 * 按后端返回的 source 字段与本地 Agent 的 marketplaceSource 求交集，
 * 已安装的卡片显示锁定态。
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ExternalLink,
  Download,
  Check,
  Loader2,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  listMarketplaceAgents,
  installMarketplaceAgent,
  listAgents,
  type AgentMarketplaceItem,
} from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';
import { folderNameOf } from '../lib/marketplace';
import { BackButton } from './ui/BackButton';
import { ListState } from './ListState';
import { MarketplaceLogo } from './MarketplaceLogo';

export const AgentMarketplaceView: React.FC = () => {
  const { t } = useTranslation();
  const { loadAgents, switchAgent } = useAgentStore();
  const setView = useViewStore((s) => s.setView);

  const [entries, setEntries] = useState<AgentMarketplaceItem[]>([]);
  const [installedSources, setInstalledSources] = useState<Set<string>>(
    new Set()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 并发拉远程清单 + 本地 Agent 列表，按 source 求交集判定已安装
      const [remote, local] = await Promise.all([
        listMarketplaceAgents(),
        listAgents(),
      ]);
      setEntries(remote);
      setInstalledSources(
        new Set(
          local.map((a) => a.marketplaceSource).filter((s): s is string => !!s)
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('agentMarketplace.loadFailed')
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInstall = async (entry: AgentMarketplaceItem) => {
    const folder = folderNameOf(entry);
    setInstalling((prev) => new Set(prev).add(folder));
    try {
      const agent = await installMarketplaceAgent(folder);
      toast.success(t('agentMarketplace.installSuccess', { name: entry.name }));
      // 刷新 Agent 列表 → 切换到新 Agent → 关闭商城
      await loadAgents();
      await switchAgent(agent.id);
      setView('chat');
    } catch (err) {
      logger.error('Failed to install agent:', err);
      toast.error(err instanceof Error ? err.message : 'Install failed');
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(folder);
        return next;
      });
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-general-bg">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* 标题 + 返回 */}
        <div className="flex items-center gap-2 mb-1">
          <BackButton onClick={() => setView('chat')} />
          <h1 className="text-[16px] font-bold text-foreground">
            {t('agentMarketplace.title')}
          </h1>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4 ml-6">
          {t('agentMarketplace.desc')}
        </p>

        {/* 列表 */}
        <ListState isLoading={isLoading} error={error} onRetry={load}>
          <div className="grid grid-cols-2 gap-2.5">
            {entries.map((entry) => {
              const folder = folderNameOf(entry);
              const isInstalled = installedSources.has(entry.source);
              const isInstalling = installing.has(folder);

              return (
                <div
                  key={folder}
                  className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-border bg-background"
                >
                  {/* logo + 名字 */}
                  <div className="flex items-start gap-2.5">
                    <MarketplaceLogo
                      logoUrl={entry.logoUrl}
                      name={entry.name}
                      fallbackIcon={UserRound}
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
                      title={t('agentMarketplace.homepage')}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1" />
                    {isInstalled ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted text-muted-foreground text-[12px]">
                        <Check className="w-3.5 h-3.5" />
                        {t('agentMarketplace.installed')}
                      </span>
                    ) : isInstalling ? (
                      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-50 text-blue-600 text-[12px]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {t('agentMarketplace.installing')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInstall(entry)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-[12px] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('agentMarketplace.install')}
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
