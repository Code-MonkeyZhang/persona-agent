/**
 * @fileoverview MCP module public API.
 */

export {
  initMcpPool,
  listMcpServers,
  getMcpServer,
  getMcpDisplayName,
  setAppNotificationHandler,
  getMcpToolsForServers,
  getMcpPromptInfo,
  startOAuthFlow,
  getOAuthStatus,
  reconnectServer,
} from './pool.js';
export type { McpServerEntry } from './types.js';
