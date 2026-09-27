/**
 * @file src/renderer/components/settings/McpListTab.tsx
 * @description 设置页「已安装工具」面板，左列表右详情的 MCP 管理
 * 左栏平铺全部已装服务与 Agent App 的卡片，行尾无动作，授权与卸载在详情里完成
 */

import React, { useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { McpServerInfo } from '../../lib/api';
import { useMcpStore } from '../../stores/mcpStore';
import { logger } from '../../lib/logger';
import { dataPath } from '../../lib/platform';
import { ListState } from '../common/ListState';
import {
  SidePanelShell,
  SidePanelHeader,
  EmptyHint,
} from '../common/SidePanel';
import { McpDetailPanel } from '../mcp/McpDetailPanel';
import { McpRow } from '../tools/toolRows';
import { useValidatedSelection } from '../../hooks/useValidatedSelection';

export const McpListTab: React.FC = () => {
  const { t } = useTranslation();
  const servers = useMcpStore((s) => s.servers);
  const loading = useMcpStore((s) => s.loading);
  const error = useMcpStore((s) => s.error);
  const load = useMcpStore((s) => s.load);
  const disposeOAuth = useMcpStore((s) => s.disposeOAuth);

  useEffect(() => {
    void load();
    return () => disposeOAuth();
  }, [load, disposeOAuth]);

  /**
   * 选中服务失效时自动修正，回退到列表第一个服务，全部卸载完悬空显示占位。
   * 卸载选中服务与首次进入由这一处逻辑覆盖。
   */
  const entries = servers ?? [];
  const [selection, setSelection] = useValidatedSelection<string>(
    (v) => entries.some((e) => e.name === v),
    () => entries[0]?.name ?? null
  );

  const handleSelect = (name: string) => {
    logger.info('[Mcp] 设置页选中服务', { name });
    setSelection(name);
  };

  const selected = entries.find((e) => e.name === selection);

  return (
    <ListState
      isLoading={loading && servers === null}
      error={error}
      onRetry={load}
    >
      <div className="h-full overflow-hidden p-5">
        <div className="flex h-full overflow-hidden rounded-xl border border-border bg-white">
          {/* 左栏，服务卡片平铺，滚动条隐藏并带上下边缘渐隐 */}
          <SidePanelShell
            width="w-64"
            padY="pt-3 pb-3"
            header={
              <SidePanelHeader
                icon={Wrench}
                titleKey="mcpPool.title"
                openDirKey="common.openDirectory"
                onOpenDir={() => window.api?.openPath(dataPath('mcp'))}
              />
            }
          >
            {entries.length === 0 ? (
              <EmptyHint text={t('mcpPool.empty')} />
            ) : (
              entries.map((server) => (
                <McpRow
                  key={server.name}
                  server={server}
                  selected={selection === server.name}
                  onClick={() => handleSelect(server.name)}
                />
              ))
            )}
          </SidePanelShell>

          {/* 右栏，共享详情，key 切换时重挂载以复位确认态 */}
          <div className="min-h-0 min-w-0 flex-1">
            {selected ? (
              <McpListDetail server={selected} />
            ) : (
              <div className="flex h-full items-center justify-center text-body text-muted-foreground">
                {t('mcpPool.empty')}
              </div>
            )}
          </div>
        </div>
      </div>
    </ListState>
  );
};

/** 右栏详情的授权重连与卸载接线，与工具页共用同一个 store */
function McpListDetail({ server }: { server: McpServerInfo }) {
  const authorizing = useMcpStore((s) => s.authorizing);
  const retrying = useMcpStore((s) => s.retrying);
  const authorize = useMcpStore((s) => s.authorize);
  const retry = useMcpStore((s) => s.retry);
  const uninstall = useMcpStore((s) => s.uninstall);

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
