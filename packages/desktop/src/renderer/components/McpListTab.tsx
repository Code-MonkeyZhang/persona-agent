/**
 * @file src/renderer/components/McpListTab.tsx
 * @description MCP 服务列表标签页，展示已配置的 MCP 服务器状态、工具数量和 OAuth 授权
 * 使用 2 列网格卡片 + 状态圆点的 Demo 视觉风格
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ExternalLink, FolderOpen } from 'lucide-react';
import {
  listMcpServers,
  startMcpOAuth,
  getMcpOAuthStatus,
  type McpServer,
} from '../lib/api';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function getStatusColor(status: McpServer['status']) {
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

export const McpListTab: React.FC = () => {
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState<string | null>(null);
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
      const data = await listMcpServers();
      setMcps(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load MCP servers'
      );
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5">
        <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4 text-center">
          <p className="text-red-500">加载失败: {error}</p>
          <button
            onClick={loadMcps}
            className="mt-2 text-[13px] text-[#666] hover:text-[#333]"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="rounded-xl border border-[#e8e8e8] bg-white px-4 py-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-[14px] font-bold text-[#333]">MCP 服务</h3>
          <button
            onClick={() =>
              window.api?.openPath('~/.local/share/persona-agent/mcp/')
            }
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-[#555] border border-[#ddd] bg-white hover:bg-[#f0f0f0] hover:border-[#bbb] transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" />
            打开目录
          </button>
        </div>
        <p className="text-[12px] text-[#999] mb-4">
          查看已配置的 MCP 服务器状态
        </p>

        {mcps.length === 0 ? (
          <div className="text-[#ccc] text-[13px] py-4 text-center">
            暂无已加载的 MCP 服务
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {mcps.map((mcp) => {
              const statusText =
                mcp.status === 'connected' && mcp.toolCount
                  ? `${mcp.toolCount} tools`
                  : mcp.status === 'needs_auth'
                    ? '需要授权'
                    : mcp.status === 'connecting'
                      ? '连接中'
                      : '未连接';
              const isLoading = authorizing === mcp.name;

              return (
                <div
                  key={mcp.name}
                  className="group flex items-center gap-2 px-3 py-3 rounded-xl border border-[#eee] bg-[#fafafa] text-left"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(mcp.status)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#333] truncate">
                      {mcp.name}
                    </div>
                    <div className="text-[11px] text-[#999] truncate">
                      {mcp.error || statusText}
                    </div>
                  </div>
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
