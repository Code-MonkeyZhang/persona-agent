/**
 * @file src/renderer/components/marketplace/MarketplaceCard.tsx
 * @description 商城浏览页用的竖向卡片，四类商品共用，差异在标识区：
 * - MCP / Agent / 应用 显示图标框（MarketplaceLogo，有远程 logo 显图，缺失显兜底图标）
 * - Skill 不显示，名字直接顶格
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
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MarketplaceLogo } from './MarketplaceLogo';

/** 卡片渲染所需的商品基础字段，各类商城条目都满足 */
export interface CardItem {
  name: string;
  author: string;
  description: string;
  homepage: string;
  path: string;
}

interface MarketplaceCardProps {
  type: 'skill' | 'mcp' | 'agent' | 'app';
  item: CardItem;
  logoUrl?: string;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
}

/**
 * 商城卡。竖向布局：标识区（可选）+ 名字与作者 + 两行简介 + 底部操作行。
 */
export const MarketplaceCard: React.FC<MarketplaceCardProps> = ({
  type,
  item,
  logoUrl,
  installed,
  installing,
  onInstall,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 h-full px-3.5 py-3 rounded-xl border border-border bg-background hover:bg-muted transition-colors">
      {/* 标识区 + 名字：MCP/Agent/应用显图标框，Skill 名字顶格 */}
      <div className="flex items-start gap-2.5">
        {type !== 'skill' && (
          <MarketplaceLogo
            logoUrl={logoUrl}
            name={item.name}
            fallbackIcon={
              type === 'mcp' ? Wrench : type === 'app' ? LayoutGrid : UserRound
            }
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-foreground truncate">
            {item.name}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            @{item.author}
          </div>
        </div>
      </div>

      {/* 两行简介（超出截断） */}
      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-[18px] h-[36px]">
        {item.description}
      </p>

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
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-muted text-muted-foreground text-[12px]">
            <Check className="w-3.5 h-3.5" />
            {t('marketplace.installed')}
          </span>
        ) : installing ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary/10 text-primary text-[12px]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('marketplace.installing')}
          </span>
        ) : (
          <button
            onClick={onInstall}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 text-[12px] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {t('marketplace.install')}
          </button>
        )}
      </div>
    </div>
  );
};
