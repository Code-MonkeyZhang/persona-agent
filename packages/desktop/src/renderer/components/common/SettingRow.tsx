/**
 * @file src/renderer/components/common/SettingRow.tsx
 * @description 通用设置行组件，提供左标签 + 右控件的统一布局
 */

import type { ReactNode } from 'react';
import { LabelWithTooltip } from './LabelWithTooltip';
import { cn } from '../../lib/utils';
import {
  useCurrentDevice,
  deviceDisplayName,
} from '../../stores/connectionStore';

interface SettingRowProps {
  label: string;
  desc?: string;
  descClassName?: string;
  tooltip?: string;
  children?: ReactNode;
}

/**
 * 设置行组件，左侧显示标签和描述，右侧放置控件。
 * 提供 tooltip 时标签由 LabelWithTooltip 渲染并附带帮助提示。
 * @param label - 设置项标签
 * @param desc - 可选的描述文字
 * @param descClassName - 描述文字的额外 className
 * @param tooltip - 可选的 tooltip 文字
 * @param children - 右侧控件区域
 */
export function SettingRow({
  label,
  desc,
  descClassName,
  tooltip,
  children,
}: SettingRowProps) {
  return (
    <div className="flex items-center justify-between min-h-[32px] gap-4">
      <div className="min-w-0">
        <LabelWithTooltip
          label={label}
          tooltip={tooltip}
          className="text-content"
        />
        {desc && (
          <div
            className={`text-caption text-muted-foreground mt-0.5 ${descClassName ?? ''}`}
          >
            {desc}
          </div>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}

interface HostChipProps {
  label: string;
  /** 远程主机用主色强调，本机保持灰色 */
  remote: boolean;
}

/** 卡片标题旁的数据归属标记，标注这个区域的信息属于哪台机器 */
export function HostChip({ label, remote }: HostChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-micro leading-none',
        remote
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          remote ? 'bg-primary' : 'bg-muted-foreground/50'
        )}
      />
      {label}
    </span>
  );
}

/**
 * 连远程时渲染一颗主机名归属标签，本机态不渲染任何内容。
 * 没有标题锚点的孤标签场景统一用它，标签常显的场景直接用 HostChip。
 * className 只作用在远程态渲染出的包装层上，本机态连包装层也不出。
 */
export function RemoteHostChip({ className }: { className?: string }) {
  const { entry, remote } = useCurrentDevice();
  if (!remote || !entry) return null;
  return (
    <div className={className}>
      <HostChip label={deviceDisplayName(entry)} remote />
    </div>
  );
}
