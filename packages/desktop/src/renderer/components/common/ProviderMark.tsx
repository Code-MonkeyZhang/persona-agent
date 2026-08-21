/**
 * @file 品牌图标组件：浅色底圆角 chip + lobe-icons 图标，查不到映射时回退首字母 monogram
 * 分两层：ProviderMark 按供应商 id 查渠道图标；ModelMark 按 modelId 查产品图标，
 * 模型未命中时回退供应商图标，语义是「经此渠道供应的未知模型」
 * 底色固定浅色，Mono 图标锁深色，保证任何主题下都可读
 */
import type { ComponentType } from 'react';
import { PROVIDER_ICONS } from '../../lib/providerIcons';
import { findModelIcon } from '../../lib/modelIcons';
import { cn } from '../../lib/utils';

/** Mono 图标在浅色底上的固定深色，不随主题文字色变化 */
const MONO_COLOR = '#1f2328';

interface IconEntry {
  Icon: ComponentType<{ size?: number | string; color?: string }>;
  mono: boolean;
  background?: string;
}

interface BrandMarkProps {
  entry: IconEntry | null;
  /** monogram 兜底时取首字母的名字 */
  name: string;
  /** chip 尺寸，默认 20 */
  size?: number;
  className?: string;
}

/** 通用品牌图标 chip，entry 为 null 时渲染首字母 monogram */
function BrandMark({ entry, name, size = 20, className }: BrandMarkProps) {
  const iconSize = Math.round(size * 0.6);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border shrink-0 overflow-hidden align-middle',
        className
      )}
      style={{
        width: size,
        height: size,
        background: entry?.background ?? '#f6f7f8',
      }}
    >
      {entry ? (
        <entry.Icon
          size={iconSize}
          color={entry.mono ? MONO_COLOR : undefined}
        />
      ) : (
        <span
          className="font-semibold text-muted-foreground"
          style={{ fontSize: size * 0.5 }}
        >
          {name[0]}
        </span>
      )}
    </span>
  );
}

interface ProviderMarkProps {
  /** 供应商 id，用于查注册表 */
  providerId: string;
  /** 供应商显示名，monogram 兜底时取首字母 */
  name: string;
  size?: number;
  className?: string;
}

/** 供应商渠道图标，按 providerId 查注册表 */
export function ProviderMark({
  providerId,
  name,
  size,
  className,
}: ProviderMarkProps) {
  return (
    <BrandMark
      entry={PROVIDER_ICONS[providerId] ?? null}
      name={name}
      size={size}
      className={className}
    />
  );
}

interface ModelMarkProps {
  /** 模型 id，用于查关键词映射表 */
  modelId: string;
  /** 供应商 id，模型未命中时回退其渠道图标 */
  providerId: string;
  /** 供应商显示名，monogram 兜底时取首字母 */
  name: string;
  size?: number;
  className?: string;
}

/** 模型产品图标，modelId 未命中回退供应商图标，再未命中走 monogram */
export function ModelMark({
  modelId,
  providerId,
  name,
  size,
  className,
}: ModelMarkProps) {
  const entry = findModelIcon(modelId) ?? PROVIDER_ICONS[providerId] ?? null;
  return (
    <BrandMark entry={entry} name={name} size={size} className={className} />
  );
}
