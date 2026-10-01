/**
 * @file src/renderer/components/marketplace/MarketplaceCard.tsx
 * @description 商城浏览页用的竖向卡片，四类商品共用，标识区统一走 MarketplaceLogo：
 * 有远程 logo 显图，缺失时 MCP 兜底 Wrench、应用兜底 LayoutGrid、Skill 兜底 Sparkles、Agent 兜底 UserRound。
 * 安装动作三态：未安装 / 安装中 / 已安装（锁住不可点）。
 */

import React from 'react';
import {
  ExternalLink,
  Download,
  Check,
  Loader2,
  Wrench,
  UserRound,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MarketplaceLogo } from './MarketplaceLogo';

/**
 * 卡片渲染所需的商品基础字段，各类商城条目都满足。
 * author 与 description 缺失时卡片隐藏对应行，logoUrl 缺失时走兜底图标。
 */
export interface CardItem {
  name: string;
  author?: string;
  description?: string;
  homepage: string;
  path: string;
  logoUrl?: string;
}

interface MarketplaceCardProps {
  type: 'skill' | 'mcp' | 'agent' | 'app';
  item: CardItem;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}

/**
 * 商城卡。竖向布局：标识区 + 名字与作者 + 两行简介 + 底部操作行。
 */
export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  type,
  item,
  installed,
  installing,
  onInstall,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 h-full px-3.5 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-colors">
      {/* 标识区 + 名字：四类同制显图标框，作者缺失时隐藏作者行 */}
      <div className="flex items-start gap-2.5">
        <MarketplaceLogo
          logoUrl={item.logoUrl}
          name={item.name}
          fallbackIcon={
            type === 'mcp'
              ? Wrench
              : type === 'app'
                ? LayoutGrid
                : type === 'skill'
                  ? Sparkles
                  : UserRound
          }
        />
        <div className="min-w-0 flex-1">
          <div className="text-body font-medium text-foreground truncate">
            {item.name}
          </div>
          {item.author && (
            <div className="text-micro text-muted-foreground truncate">
              @{item.author}
            </div>
          )}
        </div>
      </div>

      {/* 两行简介（超出截断），缺失时整块不渲染 */}
      {item.description && (
        <p className="text-micro text-muted-foreground line-clamp-2 leading-[18px] h-[36px]">
          {item.description}
        </p>
      )}

      {/* 底部操作行：左打开链接，右安装三态 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => window.api?.openExternal(item.homepage)}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={t('marketplace.openLink')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <div className="flex-1" />
        {installed ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted text-muted-foreground text-caption">
            <Check className="w-3.5 h-3.5" />
            {t('marketplace.installed')}
          </span>
        ) : installing ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary/10 text-primary text-caption">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('marketplace.installing')}
          </span>
        ) : (
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-caption transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('marketplace.install')}
          </button>
        )}
      </div>
    </div>
  );
};
