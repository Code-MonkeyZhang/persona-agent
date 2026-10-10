/**
 * @file src/renderer/components/tools/ToolDetailPanel.tsx
 * @description 工具页右栏详情，内置工具与 MCP 服务共用一套模板
 * 头部介绍、连接状态、功能表格与文档俱全，MCP 的授权按钮并在状态行
 * Agent App 走 MCP 模板，底部多一个打开应用面板的主按钮
 */

import { useTranslation } from 'react-i18next';
import { BUILT_IN_TOOLS, type ToolSelection } from './builtInTools';
import { McpDetailPanel, ToolTable } from '../mcp/McpDetailPanel';
import { useMcpStore } from '../../stores/mcpStore';
import {
  DetailRow,
  DetailSection,
  DetailTable,
  DocBox,
} from '../common/DetailSection';
import { IntroHead } from '../common/IntroHead';
import { Markdown } from '../common/Markdown';
import { ScrollArea } from '../ui/ScrollArea';
import { StatusDot } from '../ui/StatusDot';

/** 内置工具形态，连接状态只留类型与状态两行，工具表格与文档俱全，无卸载 */
function BuiltinDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const tool = BUILT_IN_TOOLS.find((x) => x.id === id);
  if (!tool) return null;
  const Icon = tool.icon;
  return (
    <ScrollArea className="h-full bg-general-bg">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        <IntroHead
          icon={
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          }
          name={tool.name}
          desc={tool.desc}
        />

        <DetailSection title={t('mcpPool.sectionConnection')}>
          <DetailTable>
            <DetailRow label={t('mcpPool.fieldType')}>
              {t('tools.typeBuiltin')}
            </DetailRow>
            <DetailRow label={t('mcpPool.fieldStatus')}>
              <span className="inline-flex items-center gap-1.5">
                <StatusDot color="bg-green-500" className="h-1.5 w-1.5" />
                {t('mcpPool.statusConnected')}
              </span>
            </DetailRow>
          </DetailTable>
        </DetailSection>

        <DetailSection title={t('mcpPool.sectionTools')}>
          <ToolTable tools={tool.tools} />
        </DetailSection>

        <DetailSection title={t('mcpPool.sectionDocs')}>
          <DocBox>
            <Markdown content={tool.instructions} className="text-content" />
          </DocBox>
        </DetailSection>
      </div>
    </ScrollArea>
  );
}

/** MCP 服务形态，完整四段管理详情，授权重连与卸载走 mcpStore */
function McpDetail({ name }: { name: string }) {
  const servers = useMcpStore((s) => s.servers);
  const authorizing = useMcpStore((s) => s.authorizing);
  const retrying = useMcpStore((s) => s.retrying);
  const authorize = useMcpStore((s) => s.authorize);
  const retry = useMcpStore((s) => s.retry);
  const uninstall = useMcpStore((s) => s.uninstall);

  /* 选中项刚被卸载时短暂悬空，容器的自动修正会立即换回有效节点 */
  const server = servers?.find((s) => s.name === name);
  if (!server) return null;

  return (
    <McpDetailPanel
      key={server.name}
      server={server}
      authorizing={authorizing === server.name}
      onAuthorize={() => void authorize(server.name)}
      retrying={retrying === server.name}
      onRetry={() => void retry(server.name)}
      onUninstall={() => void uninstall(server.name)}
    />
  );
}

/** 工具页右栏的分发壳，按选中坐标落两种形态 */
export function ToolDetailPanel({ selection }: { selection: ToolSelection }) {
  if (selection.kind === 'builtin') {
    return <BuiltinDetail id={selection.id} />;
  }
  return <McpDetail name={selection.id} />;
}
