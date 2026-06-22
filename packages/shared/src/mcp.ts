/** MCP server connection status */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'needs_auth';

/** MCP server info returned by GET /api/mcp (projection of server-internal entry) */
export interface McpServerInfo {
  name: string;
  status: McpServerStatus;
  toolCount: number;
  error?: string;
  oauthUrl?: string;
}

/** OAuth flow status returned by GET /api/mcp/:name/oauth/status */
export interface McpOAuthStatus {
  status: McpServerStatus;
  oauthUrl?: string;
  error?: string;
}
