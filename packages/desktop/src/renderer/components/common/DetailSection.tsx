/**
 * @file src/renderer/components/common/DetailSection.tsx
 * @description 详情面板骨架，区块壳、键值行、占位文案与文档容器
 */

import type { ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  children: ReactNode;
}

/** 信息行，左侧定宽灰色标签，右侧值，落在白底卡内 */
export function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-body">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-all text-foreground">
        {children}
      </span>
    </div>
  );
}

/** 键值信息列表，行边线由信息行自带，列表本身只是语义容器 */
export function DetailTable({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>;
}

interface DetailSectionProps {
  title: string;
  subtitle?: string;
  /** 区标题行尾的动作插槽，如文档区的全屏入口 */
  extra?: ReactNode;
  children: ReactNode;
}

/** 详情区块壳，区标题在卡外，内容收进白底圆角卡 */
export function DetailSection({
  title,
  subtitle,
  extra,
  children,
}: DetailSectionProps) {
  return (
    <section>
      <div className="mb-2 flex items-start justify-between pl-1">
        <div>
          <h4 className="text-title-section font-semibold text-foreground">
            {title}
          </h4>
          {subtitle && (
            <p className="mt-0.5 text-caption text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {extra && <div className="shrink-0 pt-0.5">{extra}</div>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-white">
        {children}
      </div>
    </section>
  );
}

/** 区块占位文案，作为一行落在白底卡内 */
export function SectionHint({ text }: { text: string }) {
  return (
    <p className="px-4 py-2.5 text-caption text-muted-foreground">{text}</p>
  );
}

/** 文档内容容器，直接作为白底卡的 padded 内容 */
export function DocBox({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}
