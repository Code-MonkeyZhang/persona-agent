/**
 * @file src/renderer/components/tools/ToolDetailPanel.tsx
 * @description 工具页右栏详情，注册表条目一份模板按 kind 分支
 * 内置工具状态段固定已连接，功能表列短名，文档读条目自带说明
 * 外部工具复用 MCP 详情模板，App 与普通服务同构，授权重连按钮随状态行
 */

import { useTranslation } from 'react-i18next';
import type { ToolEntryInfo, McpServerInfo } from '../../lib/api';
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
import { BUILTIN_ICONS, BUILTIN_ICON_FALLBACK } from './toolRows';

/** 内置工具形态，状态段固定已连接加开关状态行，功能与文档俱全 */
function BuiltinDetail({ entry }: { entry: ToolEntryInfo }) {
  const { t } = useTranslation();
  const Icon = BUILTIN_ICONS[entry.id] ?? BUILTIN_ICON_FALLBACK;
  return (
    <ScrollArea className="h-full bg-general-bg">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        <IntroHead
          icon={
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          }
          name={entry.name}
          desc={entry.description}
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
          <ToolTable
            tools={entry.functions.map((fn) => ({
              name: fn.shortName,
              description: fn.description,
            }))}
          />
        </DetailSection>

        {entry.instructions && (
          <DetailSection title={t('mcpPool.sectionDocs')}>
            <DocBox>
              <Markdown content={entry.instructions} className="text-content" />
            </DocBox>
          </DetailSection>
        )}
      </div>
    </ScrollArea>
  );
}

/** 注册表条目投影成 MCP 详情模板的输入形状，两份页面共用一套渲染 */
function entryToServerInfo(entry: ToolEntryInfo): McpServerInfo {
  return {
    name: entry.id,
    displayName: entry.name,
    description: entry.description,
    logoUrl: entry.logoUrl,
    status: entry.status,
    toolCount: entry.functions.length,
    tools: entry.functions.map((fn) => ({
      name: fn.shortName,
      description: fn.description,
    })),
    instructions: entry.instructions,
    url: entry.url,
    agentApp: entry.kind === 'app',
    error: entry.error,
    oauthUrl: entry.oauthUrl,
  };
}

/** 外部工具形态，App 与普通服务同构，授权重连按钮随状态行 */
function ExternalDetail({ entry }: { entry: ToolEntryInfo }) {
  const authorizing = useMcpStore((s) => s.authorizing);
  const retrying = useMcpStore((s) => s.retrying);
  const authorize = useMcpStore((s) => s.authorize);
  const retry = useMcpStore((s) => s.retry);
  const uninstall = useMcpStore((s) => s.uninstall);

  return (
    <McpDetailPanel
      key={entry.id}
      server={entryToServerInfo(entry)}
      authorizing={authorizing === entry.id}
      onAuthorize={() => void authorize(entry.id)}
      retrying={retrying === entry.id}
      onRetry={() => void retry(entry.id)}
      onUninstall={() => void uninstall(entry.id)}
    />
  );
}

/** 工具页右栏的分发壳，按选中条目落内置与外部两种形态 */
export function ToolDetailPanel({ entry }: { entry: ToolEntryInfo }) {
  if (entry.kind === 'builtin') {
    return <BuiltinDetail entry={entry} />;
  }
  return <ExternalDetail entry={entry} />;
}
