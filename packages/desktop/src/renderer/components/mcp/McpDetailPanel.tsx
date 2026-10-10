/**
 * @file src/renderer/components/mcp/McpDetailPanel.tsx
 * @description MCP 服务详情面板，工具页与设置页 MCP 管理共用
 * 头部为介绍，段落为连接状态、工具表格与文档
 * 状态只在连接状态行出现，OAuth 的授权按钮随状态行走，错误红字并入状态行
 */

import { useTranslation } from 'react-i18next';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';
import type { McpServerInfo, McpToolInfo } from '../../lib/api';
import { Markdown } from '../common/Markdown';
import {
  DetailRow,
  DetailSection,
  DetailTable,
  DocBox,
  SectionHint,
} from '../common/DetailSection';
import { IntroHead } from '../common/IntroHead';
import { UninstallButton } from '../common/UninstallButton';
import { McpLogo } from '../tools/toolRows';
import { mcpStatusMeta } from '../tools/mcpStatus';
import { ScrollArea } from '../ui/ScrollArea';
import { StatusDot } from '../ui/StatusDot';
import { useCurrentDevice } from '../../stores/connectionStore';

/**
 * 按展示状态取区块占位文案的 i18n 键。
 * 连接成功时返回 null，区块直接渲染真实内容。
 */
function sectionHintKey(
  status: McpServerInfo['status'],
  needsAuthKey: string,
  unavailableKey: string
): string | null {
  if (status === 'connected') return null;
  if (status === 'needs_auth') return needsAuthKey;
  return unavailableKey;
}

/** 描述预览的字数上限，超出部分省略号收尾，全文靠悬停提示查看 */
const DESC_PREVIEW_CHARS = 150;

/** 按字数截断描述，展开写法按码点切，避免截断处劈开表情符号，缺失时回空串 */
function previewOf(text: string | undefined): string {
  if (!text) return '';
  const chars = [...text];
  return chars.length > DESC_PREVIEW_CHARS
    ? chars.slice(0, DESC_PREVIEW_CHARS).join('') + '…'
    : text;
}

/** 状态行小按钮的公共样式，授权与重试按钮共用 */
const STATUS_ACTION_CLASS =
  'ml-2 inline-flex h-6 items-center gap-1 rounded-lg border border-border bg-white px-2 text-caption text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground disabled:opacity-50';

/** 工具表格，描述列按字数截断悬停看全文，作为白底卡的直接内容 */
export function ToolTable({ tools }: { tools: McpToolInfo[] }) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-border bg-muted/50">
          <th className="px-4 py-2 text-micro font-medium text-muted-foreground">
            {t('mcpPool.colTool')}
          </th>
          <th className="px-4 py-2 text-micro font-medium text-muted-foreground">
            {t('mcpPool.colDesc')}
          </th>
        </tr>
      </thead>
      <tbody>
        {tools.map((tool) => (
          <tr
            key={tool.name}
            className="border-b border-border last:border-b-0"
          >
            <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-caption text-foreground">
              {tool.name}
            </td>
            <td
              className="min-w-0 px-4 py-2.5 align-top text-caption text-muted-foreground"
              title={tool.description}
            >
              {previewOf(tool.description)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface McpDetailPanelProps {
  server: McpServerInfo;
  authorizing?: boolean;
  onAuthorize?: () => void;
  /** 连接失败后的重连动作，状态行的重试按钮调用 */
  onRetry?: () => void;
  retrying?: boolean;
  /** 传入时详情底部显示卸载按钮 */
  onUninstall?: () => void;
}

export function McpDetailPanel({
  server,
  authorizing,
  onAuthorize,
  onRetry,
  retrying,
  onUninstall,
}: McpDetailPanelProps) {
  const { t } = useTranslation();
  const { remote } = useCurrentDevice();

  const meta = mcpStatusMeta(server);
  const toolsHint = sectionHintKey(
    server.status,
    'mcpPool.toolsNeedsAuth',
    'mcpPool.toolsUnavailable'
  );
  const docsHint = sectionHintKey(
    server.status,
    'mcpPool.docsNeedsAuth',
    'mcpPool.docsUnavailable'
  );

  return (
    <ScrollArea className="h-full bg-general-bg">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        {/* 介绍段，图标、名字、简介与作者 */}
        <IntroHead
          icon={
            <McpLogo
              server={server}
              boxClass="h-11 w-11 border border-border bg-white"
              imgClass="h-9 w-9 object-contain"
            />
          }
          name={server.displayName ?? server.name}
          desc={server.description}
          author={server.author}
        />

        {/* 连接状态段，类型、地址与当前状态，错误红字并入状态行第二行 */}
        <DetailSection title={t('mcpPool.sectionConnection')}>
          <DetailTable>
            <DetailRow label={t('mcpPool.fieldType')}>
              {server.agentApp ? t('tools.typeAgentApp') : t('tools.typeMcp')}
            </DetailRow>
            {server.url && (
              <DetailRow label={t('mcpPool.fieldUrl')}>
                <span className="text-body">{server.url}</span>
              </DetailRow>
            )}
            <DetailRow label={t('mcpPool.fieldStatus')}>
              <span className="flex flex-col items-start gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusDot color={meta.dot} className="h-1.5 w-1.5" />
                    {t(meta.labelKey)}
                  </span>
                  {server.status === 'needs_auth' && onAuthorize && (
                    <button
                      onClick={onAuthorize}
                      disabled={authorizing || remote}
                      title={remote ? t('mcpPool.oauthRemoteHint') : undefined}
                      className={STATUS_ACTION_CLASS}
                    >
                      {authorizing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ExternalLink className="h-3 w-3" />
                      )}
                      {authorizing
                        ? t('mcpPool.authorizing')
                        : t('mcpPool.connect')}
                    </button>
                  )}
                  {server.status === 'disconnected' &&
                    server.error &&
                    onRetry && (
                      <button
                        onClick={onRetry}
                        disabled={retrying}
                        className={STATUS_ACTION_CLASS}
                      >
                        {retrying ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        {retrying ? t('mcpPool.retrying') : t('mcpPool.retry')}
                      </button>
                    )}
                </span>
                {server.error && (
                  <span className="pl-3 text-caption text-red-500">
                    {server.error}
                  </span>
                )}
              </span>
            </DetailRow>
          </DetailTable>
        </DetailSection>

        {/* 工具段，两列表格，名称等宽，描述多行换行 */}
        <DetailSection title={t('mcpPool.sectionTools')}>
          {toolsHint ? (
            <SectionHint text={t(toolsHint)} />
          ) : !server.tools || server.tools.length === 0 ? (
            <SectionHint text={t('mcpPool.toolsEmpty')} />
          ) : (
            <ToolTable tools={server.tools} />
          )}
        </DetailSection>

        {/* 文档段，握手 instructions 按 markdown 渲染 */}
        <DetailSection title={t('mcpPool.sectionDocs')}>
          {docsHint ? (
            <SectionHint text={t(docsHint)} />
          ) : server.instructions ? (
            <DocBox>
              <Markdown
                content={server.instructions}
                className="text-content"
              />
            </DocBox>
          ) : (
            <SectionHint text={t('mcpPool.docsMissing')} />
          )}
        </DetailSection>

        {onUninstall && (
          <UninstallButton
            onUninstall={onUninstall}
            hint={t('mcpPool.confirmUninstallHint')}
          />
        )}
      </div>
    </ScrollArea>
  );
}
