/**
 * @file components/MarketplaceView.tsx
 * @description 商城浏览页（顶层全屏视图）。统一承载 Agent / MCP / Skill 三个 tab、
 * 搜索框与两列卡片网格。由左下角罗盘进入，是商城的唯一入口。
 *
 * 安装语义：一律入全局池，不自动分配给任何 Agent；Agent 安装即克隆并切换。
 */
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { useViewStore } from '../stores/viewStore';
import { folderNameOf } from '../lib/marketplace';
import { BackButton } from './ui/BackButton';
import { ListState } from './ListState';
import { MarketplaceCard } from './cards/MarketplaceCard';

type Tab = 'agent' | 'mcp' | 'skill';

export const MarketplaceView: React.FC = () => {
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setView);
  const s = useMarketplaceStore();

  const [tab, setTab] = useState<Tab>('agent');
  const [query, setQuery] = useState('');

  // 切到某 tab 时按需拉取该类的清单与已装态
  useEffect(() => {
    if (tab === 'agent') s.loadAgentMarketplace();
    else if (tab === 'mcp') s.loadMcpMarketplace();
    else s.loadSkillMarketplace();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full w-full overflow-y-auto bg-general-bg">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center gap-2 mb-3">
          <BackButton onClick={() => setView('chat')} />
          <h1 className="text-[16px] font-bold text-foreground">
            {t('marketplace.title')}
          </h1>
          <div className="flex-1" />
          {/* 分段控件 */}
          <div className="flex items-center gap-0.5 bg-background border border-border rounded-lg p-0.5">
            {(['agent', 'mcp', 'skill'] as Tab[]).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={
                  'px-3 h-7 rounded-md text-[12px] font-medium transition-colors ' +
                  (tab === key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground')
                }
              >
                {t(`marketplace.tabs.${key}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[12px] text-muted-foreground mb-4 ml-10">
          {t(`marketplace.subtitle.${tab}`)}
        </p>

        {/* 搜索框 */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('marketplace.search')}
            className="w-full pl-9 pr-3 h-9 text-[13px] bg-background border border-border rounded-xl outline-none focus:border-primary/30"
          />
        </div>

        {tab === 'agent' && (
          <ListState
            isLoading={s.agentLoading}
            error={s.agentError}
            onRetry={s.loadAgentMarketplace}
          >
            <CardGrid
              emptyText={t('marketplace.empty')}
              entries={matchQuery(s.agentEntries, query)}
              isInstalled={(e) => s.agentInstalledSources.has(e.source)}
              installing={s.installing}
              onInstall={s.installAgent}
              type="agent"
            />
          </ListState>
        )}

        {tab === 'mcp' && (
          <ListState
            isLoading={s.mcpLoading}
            error={s.mcpError}
            onRetry={s.loadMcpMarketplace}
          >
            <CardGrid
              emptyText={t('marketplace.empty')}
              entries={matchQuery(s.mcpEntries, query)}
              isInstalled={(e) => s.mcpInstalled.has(folderNameOf(e))}
              installing={s.installing}
              onInstall={s.installMcp}
              type="mcp"
            />
          </ListState>
        )}

        {tab === 'skill' && (
          <ListState
            isLoading={s.skillLoading}
            error={s.skillError}
            onRetry={s.loadSkillMarketplace}
          >
            <CardGrid
              emptyText={t('marketplace.empty')}
              entries={matchQuery(s.skillEntries, query)}
              isInstalled={(e) => s.skillInstalled.has(folderNameOf(e))}
              installing={s.installing}
              onInstall={s.installSkill}
              type="skill"
            />
          </ListState>
        )}
      </div>
    </div>
  );
};

/** 按搜索词过滤（匹配名字或简介），空词返回全部 */
function matchQuery<T extends { name: string; description: string }>(
  entries: T[],
  query: string
): T[] {
  if (!query.trim()) return entries;
  const term = query.toLowerCase();
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(term) ||
      e.description.toLowerCase().includes(term)
  );
}

/** 商城条目共有的展示字段 */
interface EntryFields {
  name: string;
  author: string;
  description: string;
  homepage: string;
  path: string;
}

/** 两列卡片网格，统一处理空态与渲染。logoUrl 仅 mcp/agent 条目上存在 */
function CardGrid<T extends EntryFields>({
  entries,
  isInstalled,
  installing,
  onInstall,
  type,
  emptyText,
}: {
  entries: T[];
  isInstalled: (e: T) => boolean;
  installing: Set<string>;
  onInstall: (e: T) => void;
  type: 'agent' | 'mcp' | 'skill';
  emptyText: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground text-[13px] py-12 text-center">
        {emptyText}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {entries.map((e) => {
        const folder = folderNameOf(e);
        const logoUrl =
          'logoUrl' in e ? (e as { logoUrl?: string }).logoUrl : undefined;
        return (
          <MarketplaceCard
            key={folder}
            type={type}
            item={e}
            logoUrl={logoUrl}
            installed={isInstalled(e)}
            installing={installing.has(folder)}
            onInstall={() => onInstall(e)}
          />
        );
      })}
    </div>
  );
}
