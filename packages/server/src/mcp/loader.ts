/**
 * @fileoverview Parallel MCP server loader.
 *
 * Connects to all configured MCP servers concurrently at startup.
 * Each connection is independent - a single failure does not affect others.
 * For remote servers with URLs, creates OAuth providers for authentication support.
 */

import { Logger } from '../util/logger.js';
import { MCPServerConnection, determineConnectionType } from './connection.js';
import { McpOAuthProvider } from './oauth/provider.js';
import { getOAuthTokensPath } from '../util/paths.js';
import type { McpServerConfig } from './types.js';
import type { McpConnection, McpToolMeta } from './types.js';

export interface ConnectResult {
  name: string;
  connection?: McpConnection;
  tools: McpToolMeta[];
  error?: string;
  needsAuth?: boolean;
  oauthUrl?: string;
  serverConn?: MCPServerConnection;
}

/**
 * Connect to a single MCP server and return its connection result.
 * For remote servers (URL-based), creates an OAuth provider for authentication.
 */
async function connectOne(
  name: string,
  config: McpServerConfig
): Promise<ConnectResult> {
  const connectionType = determineConnectionType(config);

  Logger.log('MCP', `Connecting to '${name}' (${connectionType})...`);

  const authProvider = config.url
    ? new McpOAuthProvider(name, getOAuthTokensPath())
    : undefined;

  const serverConn = new MCPServerConnection({
    name,
    connectionType,
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: config.env,
    url: config.url,
    headers: config.headers,
    connectTimeoutSec: config.connect_timeout,
    executeTimeoutSec: config.execute_timeout,
    authProvider,
  });

  try {
    const result = await serverConn.connect();

    if (result.needsAuth) {
      return {
        name,
        tools: [],
        needsAuth: true,
        oauthUrl: serverConn.authorizationUrl,
        serverConn,
      };
    }

    if (!result.success) {
      return { name, tools: [], error: 'Connection failed' };
    }

    const tools: McpToolMeta[] = serverConn.tools.map((tool) => ({
      id: `mcp:${name}:${tool.name}`,
      name: tool.name,
      description: tool.description,
    }));

    const connection: McpConnection = {
      name,
      tools: serverConn.tools,
      disconnect: () => serverConn.disconnect(),
    };

    return { name, connection, tools, serverConn };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.log('ERROR', `Failed to connect MCP server '${name}': ${message}`);
    return { name, tools: [], error: message };
  }
}

/**
 * Connect to all configured MCP servers in parallel.
 *
 * @param serverConfigs - Map of server name -> config
 * @returns Array of connection results
 */
export async function connectAllServers(
  serverConfigs: Map<string, McpServerConfig>
): Promise<ConnectResult[]> {
  Logger.log('MCP', `Connecting to ${serverConfigs.size} MCP servers...`);

  const entries = Array.from(serverConfigs.entries());
  const results = await Promise.all(
    entries.map(([name, config]) => connectOne(name, config))
  );

  const connectedCount = results.filter((r) => r.connection).length;
  const needsAuthCount = results.filter((r) => r.needsAuth).length;
  const failedCount = results.length - connectedCount - needsAuthCount;

  Logger.log(
    'MCP',
    `MCP connection complete: ${connectedCount} connected, ${needsAuthCount} needs auth, ${failedCount} failed`
  );

  return results;
}
