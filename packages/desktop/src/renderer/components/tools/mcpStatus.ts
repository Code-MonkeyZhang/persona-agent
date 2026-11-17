/**
 * @file src/renderer/components/tools/mcpStatus.ts
 * @description MCP 服务在列表行与详情状态行里的展示元信息
 * 后端四态直映展示，failed 是连接失败红点
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
  failed: { dot: 'bg-red-500', labelKey: 'mcpPool.statusError' },
};

/** 取一种连接状态的展示元信息 */
export function mcpStatusMeta(status: McpServerInfo['status']): McpStatusMeta {
  return MCP_STATUS[status];
}
