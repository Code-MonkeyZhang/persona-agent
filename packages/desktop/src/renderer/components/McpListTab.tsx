/**
 * @file src/renderer/components/McpListTab.tsx
 * @description MCP 服务列表标签页，展示已配置的 MCP 服务器状态和工具数量
 */

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { listMcpServers, type McpServer } from '../lib/api';

/**
 * 根据服务器连接状态返回对应的图标组件
 * @param status MCP 服务器状态
 * @returns 带颜色的 Lucide 图标
 */
function getStatusIcon(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
    default:
      return <AlertCircle className="w-4 h-4 text-gray-400" />;
  }
}

/**
 * 根据服务器连接状态返回中文描述文本
 * @param status MCP 服务器状态
 * @returns 状态对应的中文文本
 */
function getStatusText(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'error':
      return '错误';
    default:
      return '未连接';
  }
}

/**
 * 根据服务器连接状态返回对应的 Tailwind 背景和文字颜色类名
 * @param status MCP 服务器状态
 * @returns Tailwind 类名字符串
 */
function getStatusClass(status: McpServer['status']) {
  switch (status) {
    case 'connected':
      return 'bg-green-100 text-green-700';
    case 'error':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

/**
 * MCP 服务列表标签页组件，从后端加载 MCP 服务器列表并按状态分组展示
 */
export const McpListTab: React.FC = () => {
  const [mcps, setMcps] = useState<McpServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMcps();
  }, []);

  /**
   * 从后端拉取 MCP 服务器列表并更新本地状态
   */
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">加载失败: {error}</p>
        <button
          onClick={loadMcps}
          className="mt-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900">MCP 服务</h2>
        <p className="text-sm text-gray-500 mt-1">
          查看已配置的 MCP 服务器状态
        </p>
      </div>

      {mcps.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>暂无 MCP 服务</p>
          <p className="text-sm mt-1">请在后端配置文件中添加 MCP 服务器</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mcps.map((mcp) => (
            <div
              key={mcp.name}
              className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex-shrink-0">{getStatusIcon(mcp.status)}</div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{mcp.name}</h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${getStatusClass(mcp.status)}`}
                  >
                    {getStatusText(mcp.status)}
                  </span>
                </div>
                {mcp.error && (
                  <p className="text-sm text-red-500 mt-0.5">{mcp.error}</p>
                )}
                {mcp.toolCount !== undefined && mcp.toolCount > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {mcp.toolCount} 个工具可用
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
