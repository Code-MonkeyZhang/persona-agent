/**
 * @file src/renderer/components/tools/toolRows.tsx
 * @description 工具页左栏的卡片行组件
 * 卡片结构照技能行走语言，行首图标盒、两行文本、选中底色加左侧 primary 竖条，行尾动作不触发选中
 * 第一行是名字，副行是状态点加状态文字，类型标记只在右栏详情的头部
 */

import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWindow, Wrench } from 'lucide-react';
import type { McpServerInfo } from '../../lib/api';
import { RowCard } from '../common/RowCard';
import { StatusDot } from '../ui/StatusDot';
import { mcpStatusMeta } from './mcpStatus';
import type { BuiltInTool, ToolSelection } from './builtInTools';

/**
 * MCP 服务的行首图标盒，有 logo 显图，缺失或加载失败显兜底图标
 * Agent App 与普通服务各配一个兜底，列表行与详情头部共用，盒底色由调用方经 boxClass 给
 */
export function McpLogo({
  server,
  boxClass,
  imgClass,
}: {
  server: McpServerInfo;
  boxClass: string;
  imgClass: string;
}) {
  const [failed, setFailed] = useState(false);
  const FallbackIcon = server.agentApp ? AppWindow : Wrench;
  if (!server.logoUrl || failed) {
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
        src={server.logoUrl}
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
  action?: ReactNode;
}

/** 工具页左栏的通用行，行首图标盒，两行文本为名字加状态点副行 */
function ToolRow({
  selected,
  onClick,
  leading,
  name,
  meta,
  action,
}: ToolRowProps) {
  const { t } = useTranslation();
  return (
    <RowCard selected={selected} onClick={onClick}>
      {leading}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-content text-foreground">
          {name}
        </span>
        <span className="mt-0.5 flex items-center gap-1 text-micro text-muted-foreground">
          <StatusDot color={meta.dot} className="h-1.5 w-1.5" />
          {t(meta.labelKey)}
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
  tool: BuiltInTool;
  selected: boolean;
  onClick: () => void;
  action?: ReactNode;
}

/** 内置工具卡片，行首主色图标盒，副行固定为已连接 */
export function BuiltinToolRow({
  tool,
  selected,
  onClick,
  action,
}: BuiltinToolRowProps) {
  const Icon = tool.icon;
  return (
    <ToolRow
      selected={selected}
      onClick={onClick}
      leading={
        <span className="flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      }
      name={tool.name}
      meta={{ dot: 'bg-green-500', labelKey: 'mcpPool.statusConnected' }}
      action={action}
    />
  );
}

interface McpRowProps {
  server: McpServerInfo;
  selected: boolean;
  onClick: () => void;
  action?: ReactNode;
}

/** MCP 服务卡片，行首 logo 图标盒，Agent App 用 App 图标兜底 */
export function McpRow({ server, selected, onClick, action }: McpRowProps) {
  return (
    <ToolRow
      selected={selected}
      onClick={onClick}
      leading={
        <McpLogo
          server={server}
          boxClass="h-7 w-7 self-center rounded-md bg-muted"
          imgClass="h-6 w-6 object-contain"
        />
      }
      name={server.displayName ?? server.name}
      meta={mcpStatusMeta(server)}
      action={action}
    />
  );
}

/** 选中判断，两个 kind 各自比对节点坐标 */
function isNodeSelected(
  selection: ToolSelection | null,
  node: ToolSelection
): boolean {
  return (
    !!selection && selection.kind === node.kind && selection.id === node.id
  );
}

/**
 * 行节点与选中态的配对构造，selected 判定与点击派发共用同一坐标
 * 展开进行组件，坐标只在调用点写一次
 */
export function nodeProps(
  selection: ToolSelection | null,
  onSelect: (sel: ToolSelection) => void,
  node: ToolSelection
) {
  return {
    selected: isNodeSelected(selection, node),
    onClick: () => onSelect(node),
  };
}
