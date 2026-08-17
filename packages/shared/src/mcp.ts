/** MCP server connection status */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'needs_auth';

/** Agent App 支持的端类型，用于客户端列表筛选 */
export type SupportedUI = 'desktop' | 'mobile';

/** MCP server info returned by GET /api/mcp (projection of server-internal entry) */
export interface McpServerInfo {
  name: string;
  status: McpServerStatus;
  toolCount: number;
  /** Agent App 标记：true 表示该 MCP Server 附带 Web UI，前端渲染图标栏 */
  agentApp?: boolean;
  /** 支持的端，客户端筛选用；未声明时默认只支持 desktop */
  supportedUI?: SupportedUI[];
  error?: string;
  oauthUrl?: string;
}

/** OAuth flow status returned by GET /api/mcp/:name/oauth/status */
export interface McpOAuthStatus {
  status: McpServerStatus;
  oauthUrl?: string;
  error?: string;
}
