/**
 * @fileoverview Parallel MCP server loader.
 *
 * Connects to all configured MCP servers concurrently at startup.
 * Each connection is independent - a single failure does not affect others.
 * For remote servers with URLs, creates OAuth providers for authentication support.
 */

import * as net from 'node:net';
import { Logger } from '../util/logger.js';
import { errorMessage } from '../util/errors.js';
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
  /** Agent App 分配到的 HTTP 端口（仅 agentApp:true 时有值） */
  appPort?: number;
}

/**
 * 分配一个可用的本地端口号。
 *
 * 通过让操作系统选择空闲端口再立即关闭来获取端口号。
 * 存在极小竞态，关闭后到子进程绑定之间可能被其他进程抢占，MVP 阶段可接受。
 */
function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : undefined;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error('Failed to allocate port'));
      });
    });
    server.on('error', reject);
  });
}

/**
 * Connect to a single MCP server and return its connection result.
 * For remote servers (URL-based), creates an OAuth provider for authentication.
 * For Agent App servers, allocates an HTTP port and passes it via APP_PORT env.
 *
 * @param onAppNotification - Agent App 通知回调，收到 notifications/app 时调用
 */
export async function connectOne(
  name: string,
  config: McpServerConfig,
  onAppNotification?: (params: Record<string, unknown>) => void
): Promise<ConnectResult> {
  const connectionType = determineConnectionType(config);

  Logger.log('MCP', `Connecting to '${name}' (${connectionType})...`);

  const appPort =
    config.agentApp && connectionType === 'stdio'
      ? await allocatePort()
      : undefined;

  if (appPort) {
    Logger.log('MCP', `Allocated port ${appPort} for Agent App '${name}'`);
  }

  const authProvider = config.url
    ? new McpOAuthProvider(name, getOAuthTokensPath())
    : undefined;

  const serverConn = new MCPServerConnection({
    name,
    connectionType,
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: {
      ...config.env,
      ...(appPort ? { APP_PORT: String(appPort) } : {}),
    },
    url: config.url,
    headers: config.headers,
    connectTimeoutSec: config.connect_timeout,
    executeTimeoutSec: config.execute_timeout,
    authProvider,
    onAppNotification,
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
        appPort,
      };
    }

    if (!result.success) {
      return {
        name,
        tools: [],
        error: result.error ?? 'Connection failed',
        appPort,
      };
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

    return { name, connection, tools, serverConn, appPort };
  } catch (error: unknown) {
    const message = errorMessage(error);
    Logger.log('ERROR', `Failed to connect MCP server '${name}': ${message}`);
    return { name, tools: [], error: message, appPort };
  }
}

/**
 * Connect to all configured MCP servers in parallel.
 *
 * @param serverConfigs - Map of server name -> config
 * @param onAppNotification - Agent App 通知回调，按 server name 绑定后透传给 connectOne
 * @returns Array of connection results
 */
export async function connectAllServers(
  serverConfigs: Map<string, McpServerConfig>,
  onAppNotification?: (
    params: Record<string, unknown>,
    serverName: string
  ) => void
): Promise<ConnectResult[]> {
  Logger.log('MCP', `Connecting to ${serverConfigs.size} MCP servers...`);

  const entries = Array.from(serverConfigs.entries());
  const results = await Promise.all(
    entries.map(([name, config]) =>
      connectOne(
        name,
        config,
        onAppNotification
          ? (params) => onAppNotification(params, name)
          : undefined
      )
    )
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
