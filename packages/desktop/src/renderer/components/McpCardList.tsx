/**
 * @file src/renderer/components/McpCardList.tsx
 * @description MCP 服务卡片列表（可复用）—— 展示 MCP 服务器状态、工具数量、OAuth 授权、卸载。
 * 被 McpListTab（设置页）和 McpView（sidebar 管理页）共用。
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Trash2, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  listMcpServers,
  listMarketplaceMcps,
  startMcpOAuth,
  getMcpOAuthStatus,
  uninstallMcp,
  type McpServerInfo,
} from '../lib/api';
import { logger } from '../lib/logger';
import { folderNameOf } from '../lib/marketplace';
import { toast } from '../stores/toastStore';
import { ListState } from './ListState';
import { MarketplaceLogo } from './MarketplaceLogo';
import { StatusDot } from './ui/StatusDot';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function getStatusColor(status: McpServerInfo['status']) {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
      return 'bg-blue-400';
    case 'needs_auth':
      return 'bg-amber-500';
    default:
      return 'bg-gray-300';
  }
}

export const McpCardList: React.FC = () => {
  const { t } = useTranslation();
  const [mcps, setMcps] = useState<McpServerInfo[]>([]);
  const [logoMap, setLogoMap] = useState<Map<string, string | undefined>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<McpServerInfo | null>(
    null
  );
  const [isUninstalling, setIsUninstalling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartRef = useRef<number>(0);

  useEffect(() => {
    loadMcps();
    return () => stopPolling();
  }, []);

  const loadMcps = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [localRes, marketRes] = await Promise.allSettled([
        listMcpServers(),
        listMarketplaceMcps(),
      ]);
      if (localRes.status === 'rejected') throw localRes.reason;
      setMcps(localRes.value);
      if (marketRes.status === 'fulfilled') {
        setLogoMap(
          new Map(marketRes.value.map((e) => [folderNameOf(e), e.logoUrl]))
        );
      } else {
        logger.warn(
          'Failed to load marketplace manifest for MCP logos',
          marketRes.reason
        );
        setLogoMap(new Map());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /**
   * 轮询 OAuth 授权状态，连接成功或失败时停止。
   * 超时 5 分钟后自动停止并提示用户。
   */
  const startPolling = useCallback(
    (name: string) => {
      stopPolling();
      pollingStartRef.current = Date.now();

      pollingRef.current = setInterval(async () => {
        try {
          const status = await getMcpOAuthStatus(name);

          if (status.status === 'connected') {
            stopPolling();
            setAuthorizing(null);
            logger.info('[MCP] OAuth connected for', name);
            loadMcps();
            return;
          }

          if (status.status === 'needs_auth' && status.error) {
            stopPolling();
            setAuthorizing(null);
            logger.error('[MCP] OAuth failed for', name, status.error);
            loadMcps();
            return;
          }

          if (Date.now() - pollingStartRef.current > POLL_TIMEOUT_MS) {
            stopPolling();
            setAuthorizing(null);
          }
        } catch {
          stopPolling();
          setAuthorizing(null);
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  /**
   * 触发 OAuth 授权流程：启动后端流程 → 打开浏览器 → 开始轮询状态
   */
  const handleAuthorize = async (name: string) => {
    try {
      setAuthorizing(name);
      logger.info('[MCP] Starting OAuth for', name);
      const result = await startMcpOAuth(name);

      if (result.authorizationUrl) {
        await window.api?.openExternal(result.authorizationUrl);
        logger.info('[MCP] Opened authorization URL in browser for', name);
        startPolling(name);
      } else {
        setAuthorizing(null);
        loadMcps();
      }
    } catch (err) {
      setAuthorizing(null);
      const msg =
        err instanceof Error ? err.message : 'OAuth authorization failed';
      logger.error('[MCP] OAuth failed for', name, msg);
      setError(msg);
    }
  };

  const handleConfirmUninstall = async () => {
    if (!uninstallTarget) return;
    setIsUninstalling(true);
    try {
      await uninstallMcp(uninstallTarget.name);
      await loadMcps();
      toast.success(
        t('mcpMarketplace.uninstallSuccess', { name: uninstallTarget.name })
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t('mcpMarketplace.uninstallFailed');
      toast.error(msg);
    } finally {
      setIsUninstalling(false);
      setUninstallTarget(null);
    }
  };

  return (
    <>
      <ListState isLoading={isLoading} error={error} onRetry={loadMcps}>
        {mcps.length === 0 ? (
          <div className="text-[#ccc] text-[13px] py-4 text-center">
            {t('mcp.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {mcps.map((mcp) => {
              const statusText =
                mcp.status === 'connected' && mcp.toolCount
                  ? t('mcp.toolsCount', { count: mcp.toolCount })
                  : mcp.status === 'needs_auth'
                    ? t('mcp.needsAuth')
                    : mcp.status === 'connecting'
                      ? t('mcp.connecting')
                      : t('mcp.disconnected');
              const isLoading = authorizing === mcp.name;

              return (
                <div
                  key={mcp.name}
                  className="group flex items-center gap-2 px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] text-left"
                >
                  <MarketplaceLogo
                    logoUrl={logoMap.get(mcp.name)}
                    name={mcp.name}
                    fallbackIcon={Wrench}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#333] truncate">
                      {mcp.name}
                    </div>
                    <div className="text-[11px] text-[#999] truncate">
                      {mcp.error || statusText}
                    </div>
                  </div>
                  <StatusDot color={getStatusColor(mcp.status)} />
                  {mcp.status === 'needs_auth' && (
                    <div className="shrink-0">
                      <button
                        onClick={() => handleAuthorize(mcp.name)}
                        disabled={isLoading}
                        className="h-7 px-2.5 text-[11px] rounded-full border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isLoading ? (
                          <span className="w-2.5 h-2.5 border-2 border-[#999] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            OAuth
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setUninstallTarget(mcp)}
                    className="shrink-0 h-7 px-2.5 text-[11px] rounded-full border border-[#d0d0d0] text-[#999] hover:text-red-500 hover:border-red-300 transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('mcpMarketplace.uninstall')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ListState>

      {/* 卸载确认弹窗 */}
      {uninstallTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center"
          onClick={() => !isUninstalling && setUninstallTarget(null)}
        >
          <div
            className="w-[320px] bg-white rounded-2xl shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-[#333] mb-1">
              {t('mcpMarketplace.confirmUninstallTitle')}
            </h3>
            <p className="text-[13px] text-[#777] mb-4">
              {t('mcpMarketplace.confirmUninstallDesc', {
                name: uninstallTarget.name,
              })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setUninstallTarget(null)}
                disabled={isUninstalling}
                className="flex-1 py-2 text-[13px] text-[#666] border border-[#ddd] rounded-lg hover:bg-[#f5f5f5] disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleConfirmUninstall}
                disabled={isUninstalling}
                className="flex-1 py-2 text-[13px] text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isUninstalling ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t('mcpMarketplace.uninstalling')}
                  </>
                ) : (
                  t('mcpMarketplace.confirmUninstall')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
