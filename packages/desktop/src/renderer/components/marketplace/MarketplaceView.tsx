/**
 * @file src/renderer/components/marketplace/MarketplaceView.tsx
 * @description 商城浏览页（顶层全屏视图）。统一承载 Agent / MCP / 应用 / Skill 四个 tab、
 * 搜索框与卡片网格。由左下角罗盘进入，是商城的唯一入口。
 *
 * 安装语义：一律入全局池，不自动分配给任何 Agent；Agent 安装即克隆并切换。
 *
 * 应用 tab 与 MCP tab 共用同一份 MCP 清单，按条目的 agentApp 标记分桶：
 * 应用 tab 只显示 agentApp 商品，MCP tab 不再显示。
 *
 * 布局（见 ui-design/UI决策.md「商城页面布局与头部」）：
 * - 返回键钉窗口左上边缘；固定页面头（标题 + 副标题 + Tab/搜索）不随卡片滚动；
 * - 标题与图标随当前 tab 变；四个 tab 共用同一套响应式网格。
 */
import React, { useEffect, useState } from 'react';
import {
  Search,
  VenetianMask,
  Plug,
  Sparkles,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { useViewStore } from '../../stores/viewStore';
import { folderNameOf } from '../../lib/marketplace';
import { BackButton } from '../ui/BackButton';
import { ListState } from '../common/ListState';
import { MarketplaceCard, type CardItem } from './MarketplaceCard';
import { cn } from '../../lib/utils';

type Tab = 'agent' | 'mcp' | 'app' | 'skill';

const TABS: { id: Tab; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'agent', labelKey: 'marketplace.tabs.agent', Icon: VenetianMask },
  { id: 'mcp', labelKey: 'marketplace.tabs.mcp', Icon: Plug },
  { id: 'app', labelKey: 'marketplace.tabs.app', Icon: LayoutGrid },
  { id: 'skill', labelKey: 'marketplace.tabs.skill', Icon: Sparkles },
];

const MAX_W = 'max-w-5xl';

export const MarketplaceView: React.FC = () => {
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setView);
  const s = useMarketplaceStore();

  const [tab, setTab] = useState<Tab>('agent');
  const [query, setQuery] = useState('');

  // 切到某 tab 时按需拉取该类的清单与已装态；应用 tab 与 MCP 共用清单
  useEffect(() => {
    if (tab === 'agent') s.loadAgentMarketplace();
    else if (tab === 'mcp' || tab === 'app') s.loadMcpMarketplace();
    else s.loadSkillMarketplace();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = TABS.find((x) => x.id === tab) ?? TABS[0];

  return (
    <div className="relative h-full w-full flex flex-col bg-muted">
      {/* 返回键：钉在窗口左上边缘，独立于居中列 */}
      <div className="shrink-0 px-5 pt-4">
        <BackButton onClick={() => setView('chat')} />
      </div>

      {/* 固定页面头：标题 + 副标题 + Tab/搜索，共用居中列，不随卡片滚动 */}
      <div className="shrink-0 border-b border-border bg-muted">
        <div className={cn('mx-auto px-6 pt-4 pb-4', MAX_W)}>
          {/* 标题行：当前 tab 图标 + 名称 */}
          <div className="flex items-center gap-3">
            <active.Icon className="w-8 h-8 text-primary" />
            <h1 className="text-[32px] font-bold text-foreground leading-none">
              {t(active.labelKey)}
            </h1>
          </div>

          {/* 副标题（每 tab 一句描述性文案） */}
          <p className="text-[13px] text-muted-foreground mt-5">
            {t(`marketplace.subtitle.${tab}`)}
          </p>

          {/* Tab + 搜索同一行 */}
          <div className="mt-4 flex items-center gap-3">
            <div className="inline-flex items-center gap-0.5 bg-background border border-border rounded-xl p-1">
              {TABS.map((tabItem) => (
                <button
                  key={tabItem.id}
                  onClick={() => setTab(tabItem.id)}
                  className={cn(
                    'px-4 h-9 rounded-lg text-[14px] font-medium transition-colors',
                    tab === tabItem.id
                      ? 'bg-black/5 text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(tabItem.labelKey)}
                </button>
              ))}
            </div>
            <div className="relative ml-auto w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('marketplace.search')}
                className="w-full pl-9 pr-3 py-2 text-[14px] bg-background border border-border rounded-xl outline-none focus:border-primary/30"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 卡片网格，仅此区域滚动 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className={cn('mx-auto px-6 py-6', MAX_W)}>
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
                entries={matchQuery(
                  s.mcpEntries.filter((e) => !e.agentApp),
                  query
                )}
                isInstalled={(e) => s.mcpInstalled.has(folderNameOf(e))}
                installing={s.installing}
                onInstall={s.installMcp}
                type="mcp"
              />
            </ListState>
          )}

          {tab === 'app' && (
            <ListState
              isLoading={s.mcpLoading}
              error={s.mcpError}
              onRetry={s.loadMcpMarketplace}
            >
              <CardGrid
                emptyText={t('marketplace.empty')}
                entries={matchQuery(
                  s.mcpEntries.filter((e) => e.agentApp),
                  query
                )}
                isInstalled={(e) => s.mcpInstalled.has(folderNameOf(e))}
                installing={s.installing}
                onInstall={s.installMcp}
                type="app"
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

/**
 * 统一卡片网格（四个 tab 共用同一套响应式规则），处理空态与渲染。
 * 每张卡封顶 240px、网格内居中。logoUrl 仅 mcp/agent/app 条目上存在。
 */
function CardGrid<T extends CardItem>({
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
  type: 'agent' | 'mcp' | 'app' | 'skill';
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 justify-items-center">
      {entries.map((e) => {
        const folder = folderNameOf(e);
        const logoUrl =
          'logoUrl' in e ? (e as { logoUrl?: string }).logoUrl : undefined;
        return (
          <div key={folder} className="w-full h-full max-w-[240px]">
            <MarketplaceCard
              type={type}
              item={e}
              logoUrl={logoUrl}
              installed={isInstalled(e)}
              installing={installing.has(folder)}
              onInstall={() => onInstall(e)}
            />
          </div>
        );
      })}
    </div>
  );
}
