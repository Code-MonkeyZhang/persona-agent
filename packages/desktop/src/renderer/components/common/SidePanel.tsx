/**
 * @file src/renderer/components/common/SidePanel.tsx
 * @description 列表详情布局的左栏外壳、列头与空态占位
 */

import type { ReactNode } from 'react';
import { FolderOpen, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useScrollFade } from '../../hooks/useScrollFade';

interface SidePanelHeaderProps {
  icon: LucideIcon;
  /** 标题与打开目录提示的 i18n 键，由本组件统一翻译 */
  titleKey: string;
  openDirKey: string;
  onOpenDir: () => void;
}

/** 设置页左栏列头，图标加标题，行尾是打开本地目录的按钮 */
export function SidePanelHeader({
  icon: Icon,
  titleKey,
  openDirKey,
  onOpenDir,
}: SidePanelHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-1 flex shrink-0 items-center gap-2.5 px-4 py-2">
      <Icon className="h-[18px] w-[18px] text-muted-foreground" />
      <span className="flex-1 truncate text-left text-title-section text-muted-foreground">
        {t(titleKey)}
      </span>
      <button
        onClick={onOpenDir}
        title={t(openDirKey)}
        aria-label={t(openDirKey)}
        className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <FolderOpen className="h-4 w-4" />
      </button>
    </div>
  );
}

interface SidePanelShellProps {
  /** 左栏宽度类，页面内为 w-[260px]，设置页白卡内为 w-64 */
  width: string;
  /** 外壳自身的纵向内边距类，设置页传 pt-3 pb-3 */
  padY?: string;
  header?: ReactNode;
  /** 内容区内边距差异的补充类 */
  contentClassName?: string;
  children: ReactNode;
}

/** 左栏外壳，渐变底加右边线，内容区滚动条隐藏并带上下边缘渐隐 */
export function SidePanelShell({
  width,
  padY,
  header,
  contentClassName,
  children,
}: SidePanelShellProps) {
  const { scrollRef, maskImage } = useScrollFade();
  return (
    <div
      className={cn(
        width,
        'h-full min-h-0 shrink-0 flex flex-col border-r border-border bg-gradient-to-b from-background to-muted/40',
        padY
      )}
    >
      {header}
      <div
        ref={scrollRef}
        className={cn(
          'min-h-0 scroll-hidden overflow-y-auto px-2',
          contentClassName
        )}
        style={{
          flexGrow: 1,
          flexBasis: 0,
          maskImage,
          WebkitMaskImage: maskImage,
        }}
      >
        <div className="pb-1">{children}</div>
      </div>
    </div>
  );
}

/** 空状态提示行 */
export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="px-1 py-3 text-caption text-muted-foreground">{text}</div>
  );
}

/** 页面级右栏空态，灰底整栏，提示收在内容列宽内 */
export function EmptyPane({ text }: { text: string }) {
  return (
    <div className="h-full flex-1 overflow-y-auto bg-general-bg">
      <div className="mx-auto max-w-2xl px-6">
        <EmptyHint text={text} />
      </div>
    </div>
  );
}
