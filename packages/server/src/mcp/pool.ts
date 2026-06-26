/**
 * @fileoverview MCP Connection Pool - global singleton for managing MCP server connections.
 *
 * Manages server lifecycle including OAuth authentication for remote servers.
 * When a remote MCP server requires OAuth, the pool coordinates the full flow:
 * callback server → browser redirect → token exchange → reconnection.
 */

import { Logger } from '../util/logger.js';
import { loadMcpConfig } from './config.js';
import { connectAllServers, connectOne } from './loader.js';
import { MCPServerConnection } from './connection.js';
import { McpOAuthProvider } from './oauth/provider.js';
import { startCallbackServer } from './oauth/callback.js';
import { getOAuthTokensPath } from '../util/paths.js';
import type {
  McpServerEntry,
  McpToolMeta,
  McpConnection,
  McpServerConfig,
} from './types.js';
import type { Tool } from '../tools/base.js';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

const serverEntries: Map<string, McpServerEntry> = new Map();
const connections: Map<
  string,
  { name: string; tools: Tool[]; disconnect: () => Promise<void> }
> = new Map();
const serverConnections: Map<string, MCPServerConnection> = new Map();

const pendingOAuth: Map<string, { status: string; error?: string }> = new Map();

let initialized = false;

/**
 * Initialize the MCP connection pool.
 * Reads config, then connects to all servers in parallel.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export async function initMcpPool(): Promise<void> {
  if (initialized) return;

  const serverConfigs = loadMcpConfig();
  if (serverConfigs.size === 0) {
    Logger.log('MCP', 'No MCP servers to connect');
    return;
  }

  for (const [name, config] of serverConfigs) {
    serverEntries.set(name, {
      name,
      config,
      status: 'connecting',
      tools: [],
    });
  }

  const results = await connectAllServers(serverConfigs);

  for (const result of results) {
    const entry = serverEntries.get(result.name);
    if (!entry) continue;

    if (result.serverConn) {
      serverConnections.set(result.name, result.serverConn);
    }

    if (result.connection) {
      connections.set(result.name, result.connection);
      entry.status = 'connected';
      entry.tools = result.tools;
      entry.error = undefined;
    } else if (result.needsAuth) {
      entry.status = 'needs_auth';
      entry.oauthUrl = result.oauthUrl;
      entry.error = undefined;
      Logger.log(
        'MCP',
        `Server '${result.name}' requires OAuth authentication`
      );
    } else {
      entry.status = 'disconnected';
      entry.error = result.error ?? 'Unknown error';
    }
  }

  initialized = true;
}

/**
 * List all MCP server entries with their status and tools.
 */
export function listMcpServers(): McpServerEntry[] {
  return Array.from(serverEntries.values());
}

/**
 * Get a specific MCP server entry by name.
 */
export function getMcpServer(name: string): McpServerEntry | undefined {
  return serverEntries.get(name);
}

/**
 * Get all tools from the specified MCP servers.
 * Only returns tools from servers that are currently connected.
 * Disconnected or unknown servers are skipped.
 *
 * @param serverNames - List of MCP server names
 * @returns Array of Tool instances from connected servers
 */
export function getMcpToolsForServers(serverNames: string[]): Tool[] {
  const allTools: Tool[] = [];

  for (const name of serverNames) {
    const entry = serverEntries.get(name);
    if (!entry || entry.status !== 'connected') {
      if (entry) {
        Logger.log(
          'MCP',
          `Server '${name}' is ${entry.status}, skipping its tools`
        );
      } else {
        Logger.log('MCP', `Server '${name}' not found, skipping`);
      }
      continue;
    }

    const connection = connections.get(name);
    if (connection) {
      allTools.push(...connection.tools);
    }
  }

  return allTools;
}

/**
 * Get MCP server status info for system prompt generation.
 * Returns server name -> status mapping for the specified names.
 *
 * @param serverNames - List of MCP server names
 * @returns Array of { name, status } for prompt inclusion
 */
export function getMcpPromptInfo(
  serverNames: string[]
): Array<{ name: string; status: string }> {
  return serverNames.map((name) => {
    const entry = serverEntries.get(name);
    return {
      name,
      status: entry?.status ?? 'unknown',
    };
  });
}

/**
 * Start the OAuth flow for a server that requires authentication.
 *
 * This method:
 * - Starts a local callback server on a random port
 * - Creates a new connection with an OAuth provider
 * - Triggers the SDK's built-in OAuth discovery + PKCE flow
 * - Returns the authorization URL for the frontend to open in a browser
 * - In the background: waits for callback → finishAuth → reconnect → update status
 *
 * The frontend should:
 * - Call shell.openExternal(authorizationUrl) to open the browser
 * - Poll getOAuthStatus() until status becomes 'connected'
 *
 * @param name - MCP server name
 * @returns The authorization URL to open in the browser
 */
export async function startOAuthFlow(name: string): Promise<{
  authorizationUrl: string;
}> {
  const entry = serverEntries.get(name);
  if (!entry) {
    throw new Error(`MCP server '${name}' not found`);
  }
  if (entry.status !== 'needs_auth' && entry.status !== 'disconnected') {
    throw new Error(
      `Server '${name}' is '${entry.status}', cannot start OAuth`
    );
  }
  if (pendingOAuth.has(name)) {
    throw new Error(`OAuth flow already in progress for '${name}'`);
  }

  pendingOAuth.set(name, { status: 'starting' });
  entry.status = 'connecting';
  entry.error = undefined;

  Logger.log('MCP-OAuth', `Starting OAuth flow for '${name}'`);

  const callback = await startCallbackServer();

  Logger.log('MCP-OAuth', `Callback server listening on port ${callback.port}`);

  const provider = new McpOAuthProvider(name, getOAuthTokensPath());
  provider.setRedirectUrl(`http://localhost:${callback.port}/callback`);
  provider.invalidateCredentials('all');

  const serverConn = new MCPServerConnection({
    name,
    connectionType: 'streamable_http',
    url: entry.config.url,
    headers: entry.config.headers,
    connectTimeoutSec: entry.config.connect_timeout,
    executeTimeoutSec: entry.config.execute_timeout,
    authProvider: provider,
  });
  serverConnections.set(name, serverConn);

  try {
    const result = await serverConn.connect();

    if (!result.needsAuth) {
      callback.close();
      pendingOAuth.delete(name);

      const tools = buildToolMetaList(name, serverConn);
      const connection: McpConnection = {
        name,
        tools: serverConn.tools,
        disconnect: () => serverConn.disconnect(),
      };
      connections.set(name, connection);
      entry.status = 'connected';
      entry.tools = tools;
      return { authorizationUrl: '' };
    }

    const authorizationUrl = serverConn.authorizationUrl;
    if (!authorizationUrl) {
      throw new Error('OAuth flow started but no authorization URL was saved');
    }

    pendingOAuth.set(name, { status: 'authorizing' });
    entry.oauthUrl = authorizationUrl;

    handleOAuthCallback(name, serverConn, callback, entry);

    return { authorizationUrl };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    callback.close();
    pendingOAuth.delete(name);
    entry.status = 'disconnected';
    entry.error = message;
    throw error;
  }
}

/**
 * Background handler: wait for browser callback → finishAuth → reconnect.
 * All errors update the entry status instead of throwing.
 */
async function handleOAuthCallback(
  name: string,
  serverConn: MCPServerConnection,
  callback: { waitForCode: () => Promise<string>; close: () => void },
  entry: McpServerEntry
): Promise<void> {
  try {
    const code = await Promise.race([
      callback.waitForCode(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('OAuth callback timed out')),
          OAUTH_TIMEOUT_MS
        )
      ),
    ]);

    pendingOAuth.set(name, { status: 'exchanging' });
    await serverConn.finishAuth(code);
    Logger.log('MCP', `OAuth token exchange completed for '${name}'`);

    pendingOAuth.set(name, { status: 'connecting' });
    serverConn.tools = [];
    const connectResult = await serverConn.connect();

    if (!connectResult.success) {
      throw new Error('Reconnection failed after OAuth');
    }

    const tools = buildToolMetaList(name, serverConn);
    const connection: McpConnection = {
      name,
      tools: serverConn.tools,
      disconnect: () => serverConn.disconnect(),
    };

    connections.set(name, connection);
    entry.status = 'connected';
    entry.tools = tools;
    entry.error = undefined;
    entry.oauthUrl = undefined;

    pendingOAuth.set(name, { status: 'done' });
    Logger.log(
      'MCP',
      `OAuth flow completed for '${name}' - ${tools.length} tools loaded`
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    Logger.log('ERROR', `OAuth flow failed for '${name}': ${message}`);
    entry.status = 'needs_auth';
    entry.error = `OAuth failed: ${message}`;
    pendingOAuth.set(name, { status: 'failed', error: message });
  } finally {
    callback.close();
    setTimeout(() => pendingOAuth.delete(name), 5000);
  }
}

function buildToolMetaList(
  name: string,
  serverConn: MCPServerConnection
): McpToolMeta[] {
  return serverConn.tools.map((tool) => ({
    id: `mcp:${name}:${tool.name}`,
    name: tool.name,
    description: tool.description,
  }));
}

/**
 * Get the current OAuth status for a server.
 * Used by the frontend to poll during the authorization flow.
 *
 * @returns status and optional oauthUrl / error
 */
export function getOAuthStatus(name: string): {
  status: McpServerEntry['status'];
  oauthUrl?: string;
  error?: string;
} {
  const entry = serverEntries.get(name);
  if (!entry) {
    throw new Error(`MCP server '${name}' not found`);
  }

  return {
    status: entry.status,
    oauthUrl: entry.oauthUrl,
    error: entry.error,
  };
}

/**
 * 运行时添加一个 MCP 服务器并连接（商城安装后调用）。
 *
 * 注册 entry（status=connecting）→ connectOne 连接 → 按结果更新状态。
 * 连接结果可能是 connected / needs_auth / disconnected——都不抛异常，
 * 由调用方根据返回后 getMcpServer(name) 的 status 决定怎么提示用户。
 *
 * @param name server 名字
 * @param config server 配置（占位符已替换完毕）
 * @throws 如果同名 server 已存在于池中
 */
export async function addServer(
  name: string,
  config: McpServerConfig
): Promise<void> {
  if (serverEntries.has(name)) {
    throw new Error(`MCP server '${name}' already exists in pool`);
  }

  Logger.log('MCP', `Adding server '${name}' to pool at runtime`);

  serverEntries.set(name, {
    name,
    config,
    status: 'connecting',
    tools: [],
  });

  const result = await connectOne(name, config);

  if (result.serverConn) {
    serverConnections.set(name, result.serverConn);
  }

  const entry = serverEntries.get(name);
  if (!entry) return;

  if (result.connection) {
    connections.set(name, result.connection);
    entry.status = 'connected';
    entry.tools = result.tools;
    entry.error = undefined;
    Logger.log(
      'MCP',
      `Server '${name}' connected at runtime (${result.tools.length} tools)`
    );
  } else if (result.needsAuth) {
    entry.status = 'needs_auth';
    entry.oauthUrl = result.oauthUrl;
    entry.error = undefined;
    Logger.log('MCP', `Server '${name}' requires OAuth authentication`);
  } else {
    entry.status = 'disconnected';
    entry.error = result.error ?? 'Unknown error';
    Logger.log('MCP', `Server '${name}' failed to connect: ${entry.error}`);
  }
}

/**
 * 运行时移除一个 MCP 服务器（商城卸载时调用）。
 *
 * 断开连接 → 清理 connections / serverConnections / pendingOAuth / serverEntries。
 * 如果 server 不存在于池中，静默跳过（幂等）。
 *
 * @param name server 名字
 */
export async function removeServer(name: string): Promise<void> {
  const conn = connections.get(name);
  if (conn) {
    await conn.disconnect().catch(() => {});
    connections.delete(name);
  }

  const serverConn = serverConnections.get(name);
  if (serverConn) {
    await serverConn.disconnect().catch(() => {});
    serverConnections.delete(name);
  }

  pendingOAuth.delete(name);
  serverEntries.delete(name);

  Logger.log('MCP', `Server '${name}' removed from pool`);
}
