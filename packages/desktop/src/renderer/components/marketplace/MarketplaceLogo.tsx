/**
 * @file src/renderer/components/marketplace/MarketplaceLogo.tsx
 * @description 商城商品图标。有 logo 时加载远程图，缺失或加载失败时显示兜底图标。
 * 兜底规则：logoUrl 缺失或 img onError 时显示兜底图标。
 * MCP 用 Wrench、Agent 用 UserRound、Skill 用 Sparkles，由调用方通过 fallbackIcon 指定。
 */

import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/** 图标盒尺寸档位，sm 给列表行，md 给商城卡片，lg 给详情头部 */
const BOX_SIZES = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-11 h-11',
} as const;

/** 兜底图标的尺寸档位，随盒子同步缩放 */
const ICON_SIZES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
} as const;

interface MarketplaceLogoProps {
  logoUrl?: string | null;
  name: string;
  fallbackIcon: LucideIcon;
  size?: keyof typeof BOX_SIZES;
}

/**
 * 商城商品图标组件。
 * 有 logoUrl 时渲染 img，加载失败或缺失时渲染兜底图标。
 * logoUrl 变化时重置失败状态，避免切换条目卡在兜底。
 */
export const MarketplaceLogo: React.FC<MarketplaceLogoProps> = ({
  logoUrl,
  name,
  fallbackIcon: Fallback,
  size = 'md',
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return (
      <div
        className={cn(
          BOX_SIZES[size],
          'rounded-lg bg-muted flex-shrink-0',
          'flex items-center justify-center text-muted-foreground'
        )}
      >
        <Fallback className={ICON_SIZES[size]} />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className={cn(
        BOX_SIZES[size],
        'rounded-lg object-contain bg-muted flex-shrink-0'
      )}
      onError={() => setFailed(true)}
    />
  );
};
