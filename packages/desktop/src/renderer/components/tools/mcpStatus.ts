/**
 * @file src/renderer/components/tools/mcpStatus.ts
 * @description MCP 服务在列表行与详情状态行里的展示元信息
 * 后端四态直映展示，连接失败与未连接共用 disconnected 靠 error 区分，
 * 带 error 的未连接显红点配连接失败文案
 */

import type { McpServerInfo } from '../../lib/api';

export interface McpStatusMeta {
  dot: string;
  labelKey: string;
}

const MCP_STATUS: Record<McpServerInfo['status'], McpStatusMeta> = {
  connected: { dot: 'bg-green-500', labelKey: 'mcpPool.statusConnected' },
  connecting: { dot: 'bg-blue-400', labelKey: 'mcpPool.statusConnecting' },
  needs_auth: { dot: 'bg-amber-500', labelKey: 'mcpPool.statusNeedsAuth' },
  disconnected: { dot: 'bg-gray-300', labelKey: 'mcpPool.statusDisconnected' },
};

/** 取服务的展示状态，失败的未连接覆盖为红点加连接失败文案 */
export function mcpStatusMeta(server: McpServerInfo): McpStatusMeta {
  if (server.status === 'disconnected' && server.error) {
    return { dot: 'bg-red-500', labelKey: 'mcpPool.statusError' };
  }
  return MCP_STATUS[server.status];
}
