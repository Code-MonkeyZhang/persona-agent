/**
 * @fileoverview MCP module public API.
 */

export {
  initMcpPool,
  listMcpServers,
  getMcpServer,
  getMcpToolsForServers,
  getMcpPromptInfo,
  startOAuthFlow,
  getOAuthStatus,
  addServer,
  removeServer,
} from './pool.js';
export { loadMcpConfig, saveMcpServer, deleteMcpServer } from './config.js';
export type { McpServerEntry, McpServerConfig } from './types.js';
