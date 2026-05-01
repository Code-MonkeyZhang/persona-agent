/**
 * @file src/renderer/components/McpListTab.tsx
 * @description MCP 服务列表标签页，展示已配置的 MCP 服务器状态、工具数量和 OAuth 授权
 * 使用外层白色卡片 + 列表项浅灰背景的 Demo 视觉风格
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle, XCircle, KeyRound } from 'lucide-react';
import {
  listMcpServers,
  startMcpOAuth,
  getMcpOAuthStatus,
  type McpServer,
} from '../lib/api';
import { logger } from '../lib/logger';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function getStatusIcon(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'needs_auth':
      return <KeyRound className="w-4 h-4 text-amber-500" />;
    case 'connecting':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
    default:
      return <XCircle className="w-4 h-4 text-red-500" />;
  }
}

function getStatusText(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'needs_auth':
      return '需要授权';
    case 'connecting':
      return '连接中';
    case 'disconnected':
      return '未连接';
    default:
      return '未连接';
  }
}

function getStatusClass(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return 'bg-green-100 text-green-700';
    case 'needs_auth':
      return 'bg-amber-100 text-amber-700';
    case 'connecting':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-600';
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
        <h3 className="text-[14px] font-bold text-[#333] mb-1">MCP 服务</h3>
        <p className="text-[12px] text-[#999] mb-4">
          查看已配置的 MCP 服务器状态
        </p>

        {mcps.length === 0 ? (
          <div className="text-center py-8 text-[#999]">
            <p className="text-[13px]">暂无 MCP 服务</p>
            <p className="text-[12px] mt-1">
              请在后端配置文件中添加 MCP 服务器
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mcps.map((mcp) => (
              <div
                key={mcp.name}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#eee] bg-[#fafafa]"
              >
                <div className="shrink-0">{getStatusIcon(mcp.status)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#333]">
                      {mcp.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] ${getStatusClass(mcp.status)}`}
                    >
                      {getStatusText(mcp.status)}
                    </span>
                  </div>
                  {mcp.error && (
                    <p className="text-[12px] text-red-500 mt-0.5">
                      {mcp.error}
                    </p>
                  )}
                  {mcp.status === 'connected' &&
                    mcp.toolCount !== undefined &&
                    mcp.toolCount > 0 && (
                      <p className="text-[12px] text-[#999] mt-0.5">
                        {mcp.toolCount} 个工具可用
                      </p>
                    )}
                </div>

                {mcp.status === 'needs_auth' && (
                  <button
                    onClick={() => handleAuthorize(mcp.name)}
                    disabled={authorizing === mcp.name}
                    className="shrink-0 h-7 px-3 text-[11px] rounded-full border border-[#d0d0d0] text-[#666] hover:text-[#333] hover:border-[#999] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {authorizing === mcp.name ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        授权中...
                      </span>
                    ) : (
                      '去授权'
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
