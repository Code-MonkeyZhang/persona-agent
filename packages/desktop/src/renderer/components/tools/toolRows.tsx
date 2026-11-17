/**
 * @file src/renderer/components/tools/toolRows.tsx
 * @description 工具页左栏的卡片行组件
 * 卡片结构照技能行走语言，行首图标盒、两行文本、选中底色加左侧 primary 竖条，行尾动作不触发选中
 * 第一行是名字，副行内置随开关显功能数或已关闭，外部是状态点加状态文字
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppWindow,
  BookHeart,
  FileText,
  Globe,
  Smile,
  Terminal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { BUILTIN_TOOLSET_IDS } from '@persona/shared';
import type { ToolEntryInfo } from '../../lib/api';
import { RowCard } from '../common/RowCard';
import { StatusDot } from '../ui/StatusDot';
import { mcpStatusMeta } from './mcpStatus';

/** 工具页选中态坐标，注册表条目 id 全局唯一，一元坐标够用 */
export type ToolSelection = { id: string };

const [TERMINAL_ID, FILES_ID, WEB_ID, POSE_ID, MEMORY_ID] = BUILTIN_TOOLSET_IDS;

/** 内置条目的行首图标，键取 shared 的条目 id 常量，改名自动跟随 */
export const BUILTIN_ICONS: Record<string, LucideIcon> = {
  [TERMINAL_ID]: Terminal,
  [FILES_ID]: FileText,
  [WEB_ID]: Globe,
  [POSE_ID]: Smile,
  [MEMORY_ID]: BookHeart,
};

/** 内置条目兜底图标，映射缺项时兜底 */
export const BUILTIN_ICON_FALLBACK: LucideIcon = Wrench;

/**
 * 外部工具的行首图标盒，有 logo 显图，缺失或加载失败按 App 与服务各配兜底
 * 列表行与详情头部共用，盒底色由调用方经 boxClass 给
 */
export function ExternalLogo({
  logoUrl,
  app,
  boxClass,
  imgClass,
}: {
  logoUrl?: string;
  app: boolean;
  boxClass: string;
  imgClass: string;
}) {
  const [failed, setFailed] = useState(false);
  const FallbackIcon = app ? AppWindow : Wrench;
  if (!logoUrl || failed) {
    return (
      <span
        className={`${boxClass} flex shrink-0 items-center justify-center rounded-lg text-muted-foreground`}
      >
        <FallbackIcon className="h-5 w-5" />
      </span>
    );
  }
  return (
    <span
      className={`${boxClass} flex shrink-0 items-center justify-center rounded-lg`}
    >
      <img
        src={logoUrl}
        alt=""
        className={imgClass}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

interface ToolRowProps {
  selected: boolean;
  onClick: () => void;
  /** 行首图标盒节点 */
  leading: ReactNode;
  name: string;
  /** 副行状态元信息，状态点色加文案键 */
  meta: { dot: string; labelKey: string };
  /** 副行固定文案，有值时优先于 meta */
  subText?: string;
  /** 关闭态置灰 */
  dimmed?: boolean;
  action?: ReactNode;
}

/** 工具页左栏的通用行，行首图标盒，两行文本为名字加状态点副行 */
function ToolRow({
  selected,
  onClick,
  leading,
  name,
  meta,
  subText,
  dimmed,
  action,
}: ToolRowProps) {
  const { t } = useTranslation();
  return (
    <RowCard selected={selected} onClick={onClick} dimmed={dimmed}>
      {leading}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-content text-foreground">
          {name}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-micro text-muted-foreground">
          {subText ? (
            subText
          ) : (
            <>
              <StatusDot color={meta.dot} className="h-1.5 w-1.5" />
              {t(meta.labelKey)}
            </>
          )}
        </span>
      </div>
      {action && (
        <div
          className="shrink-0 self-center"
          onClick={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      )}
    </RowCard>
  );
}

interface BuiltinToolRowProps {
  entry: ToolEntryInfo;
  selected: boolean;
  onClick: () => void;
  /** 行尾开关，开关态读条目的 assigned */
  switchSlot?: ReactNode;
}

/** 内置工具卡片，行首主色图标盒，副行随开关显功能数或已关闭 */
export function BuiltinToolRow({
  entry,
  selected,
  onClick,
  switchSlot,
}: BuiltinToolRowProps) {
  const { t } = useTranslation();
  const Icon = BUILTIN_ICONS[entry.id] ?? BUILTIN_ICON_FALLBACK;
  const on = entry.assigned !== false;
  return (
    <ToolRow
      selected={selected}
      onClick={onClick}
      dimmed={!on}
      leading={
        <span className="flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      }
      name={entry.name}
      meta={{ dot: 'bg-green-500', labelKey: 'mcpPool.statusConnected' }}
      subText={
        on
          ? t('tools.funcCount', { count: entry.functions.length })
          : t('tools.off')
      }
      action={switchSlot}
    />
  );
}

interface ExternalToolRowProps {
  name: string;
  status: ToolEntryInfo['status'];
  logoUrl?: string;
  app: boolean;
  selected: boolean;
  onClick: () => void;
  action?: ReactNode;
}

/** 外部工具卡片，行首 logo 图标盒，App 用 App 图标兜底 */
export function ExternalToolRow({
  name,
  status,
  logoUrl,
  app,
  selected,
  onClick,
  action,
}: ExternalToolRowProps) {
  return (
    <ToolRow
      selected={selected}
      onClick={onClick}
      leading={
        <ExternalLogo
          logoUrl={logoUrl}
          app={app}
          boxClass="h-7 w-7 self-center rounded-md bg-muted"
          imgClass="h-6 w-6 object-contain"
        />
      }
      name={name}
      meta={mcpStatusMeta(status)}
      action={action}
    />
  );
}

/** 行节点与选中态的配对构造，selected 判定与点击派发共用同一坐标 */
export function nodeProps(
  selection: ToolSelection | null,
  onSelect: (sel: ToolSelection) => void,
  node: ToolSelection
) {
  return {
    selected: !!selection && selection.id === node.id,
    onClick: () => onSelect(node),
  };
}
