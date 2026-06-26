/**
 * @file components/MarketplaceView.tsx
 * @description Skill 商城视图。单列滚动布局，卡片三态：未安装 / 安装中 / 已安装。
 * 从 SkillsView 进入，安装后会自动把该 Skill 分配给当前 Agent。卸载不在本视图，放阶段 5 的 SkillListTab。
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Search, ExternalLink, Download, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  listMarketplaceSkills,
  listSkills,
  installMarketplaceSkill,
  type MarketplaceEntry,
} from '../lib/api';
import { useAgentStore } from '../stores/agentStore';
import { useViewStore } from '../stores/viewStore';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';
import { folderNameOf } from '../lib/marketplace';
import { BackButton } from './ui/BackButton';
import { ListState } from './ListState';

export const MarketplaceView: React.FC = () => {
  const { t } = useTranslation();
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const updateAgentSkillNames = useAgentStore((s) => s.updateAgentSkillNames);
  const setActiveNav = useViewStore((s) => s.setActiveNav);

  const [entries, setEntries] = useState<MarketplaceEntry[]>([]);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 正在安装的文件夹名集合 */
  const [installing, setInstalling] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 并发拉远程清单 + 本地已装列表，合并出每张卡片的「已安装」状态
      const [remote, local] = await Promise.all([
        listMarketplaceSkills(),
        listSkills(),
      ]);
      setEntries(remote);
      setInstalledNames(new Set(local.map((s) => s.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleInstall = async (entry: MarketplaceEntry) => {
    const folder = folderNameOf(entry);
    if (!currentAgent) return;
    setInstalling((prev) => new Set(prev).add(folder));
    try {
      // - 后端下载 + 入池
      await installMarketplaceSkill(folder);
      // - 前端把 skill 分配给当前 Agent
      const next = Array.from(new Set([...currentAgent.skillNames, folder]));
      await updateAgentSkillNames(currentAgent.id, next);
      // - 本地标记为已安装
      setInstalledNames((prev) => new Set(prev).add(folder));
      toast.success(t('marketplace.installSuccess', { name: entry.name }));
    } catch (err) {
      logger.error('Failed to install skill:', err);
      toast.error(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(folder);
        return next;
      });
    }
  };

  // 搜索过滤：匹配名字或简介
  const filtered = entries.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full w-full overflow-y-auto bg-muted">
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* 标题 + 返回 */}
        <div className="flex items-center gap-2 mb-1">
          <BackButton onClick={() => setActiveNav('skills')} />
          <h1 className="text-[16px] font-bold text-foreground">
            {t('marketplace.title')}
          </h1>
        </div>
        {/* 说明小字：ml-6 对齐标题下方 */}
        <p className="text-[12px] text-muted-foreground mb-4 ml-6">
          {t('marketplace.subtitle')}
        </p>

        {/* 搜索框 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('marketplace.search')}
            className="w-full pl-9 pr-3 h-9 text-[13px] bg-background border border-border rounded-xl outline-none focus:border-blue-300"
          />
        </div>

        {/* 列表 */}
        <ListState isLoading={isLoading} error={error} onRetry={load}>
          {filtered.length === 0 ? (
            <div className="text-muted-foreground text-[13px] py-12 text-center">
              {t('marketplace.empty')}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {filtered.map((entry) => {
                const folder = folderNameOf(entry);
                const installed = installedNames.has(folder);
                const isInstalling = installing.has(folder);
                return (
                  <div
                    key={folder}
                    className="flex flex-col gap-3 px-3.5 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate">
                        {entry.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 truncate">
                        @{entry.author}
                      </div>
                      <div className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed mt-0.5">
                        {entry.description}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => window.api?.openExternal(entry.homepage)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
                        title={t('marketplace.openLink')}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex-1" />
                      {/* 三态：已安装 / 安装中 / 未安装 */}
                      {installed ? (
                        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted text-muted-foreground text-[12px]">
                          <Check className="w-3.5 h-3.5" />
                          {t('marketplace.installed')}
                        </span>
                      ) : isInstalling ? (
                        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-50 text-blue-600 text-[12px]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {t('marketplace.installing')}
                        </span>
                      ) : (
                        <button
                          onClick={() => handleInstall(entry)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-[12px] transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('marketplace.install')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ListState>
      </div>
    </div>
  );
};
