/**
 * @file src/renderer/components/marketplace/MarketplaceLogo.tsx
 * @description 商城商品图标。有 logo 时加载远程图，缺失或加载失败时显示兜底图标。
 * 兜底规则：logoUrl 缺失或 img onError 时显示兜底图标。
 * MCP 用 Wrench、Agent 用 UserRound，由调用方通过 fallbackIcon 指定。
 */

import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MarketplaceLogoProps {
  logoUrl?: string | null;
  name: string;
  fallbackIcon: LucideIcon;
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
}) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  if (!logoUrl || failed) {
    return (
      <div
        className={cn(
          'w-10 h-10 rounded-lg bg-muted flex-shrink-0',
          'flex items-center justify-center text-muted-foreground'
        )}
      >
        <Fallback className="w-5 h-5" />
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className="w-10 h-10 rounded-lg object-contain bg-muted flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
};
