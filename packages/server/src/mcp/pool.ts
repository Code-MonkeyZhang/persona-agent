/**
 * @fileoverview MCP Connection Pool - global singleton for managing MCP server connections.
 *
 * Manages server lifecycle including OAuth authentication for remote servers.
 * When a remote MCP server requires OAuth, the pool coordinates the full flow:
 * callback server → browser redirect → token exchange → reconnection.
 */

import { Logger } from '../util/logger.js';
import { errorMessage } from '../util/errors.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadMcpConfig } from './config.js';
import {
  connectAllServers,
  connectOne,
  type ConnectHandlers,
  type ConnectResult,
} from './loader.js';
import {
  recordAppPid,
  removeAppPids,
  sweepStaleAppPids,
} from './app-pid-ledger.js';
import { MCPServerConnection } from './connection.js';
import { McpOAuthProvider } from './oauth/provider.js';
import { startCallbackServer } from './oauth/callback.js';
import {
  getOAuthTokensPath,
  getMcpServersDir,
  getMcpConfigPath,
} from '../util/paths.js';
import { produceLocalLogoUrl } from '../util/local-logo.js';
import { emitToolsInvalidated } from '../session/changes.js';
import {
  toolRegistry,
  toFullName,
  splitFullName,
  type RegistryEntry,
} from '../tools/index.js';
import type {
  McpServerEntry,
  McpToolMeta,
  McpConnection,
  McpServerConfig,
} from './types.js';
import type { Tool } from '../tools/base.js';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** 清单变化通知的防抖窗，短时多次合成一次对账 */
const RECONCILE_DEBOUNCE_MS = 800;
/** 配置文件变更的防抖窗，写文件的中间态不触发重载 */
const CONFIG_RELOAD_DEBOUNCE_MS = 1000;

const serverEntries: Map<string, McpServerEntry> = new Map();
const connections: Map<
  string,
  { name: string; tools: Tool[]; disconnect: () => Promise<void> }
> = new Map();
const serverConnections: Map<string, MCPServerConnection> = new Map();
/** Agent App 名称 → HTTP 端口映射，供反向代理查询 */
const appPorts: Map<string, number> = new Map();

/** Agent App 通知回调，由 http-server 注册 */
let appNotificationHandler:
  | ((params: Record<string, unknown>, serverName: string) => void)
  | null = null;

const pendingOAuth: Map<string, { status: string; error?: string }> = new Map();

let initialized = false;

/** 注册表变更订阅的退订句柄，整池收尾时释放 */
let registryUnsubscribe: (() => void) | null = null;
/** 配置文件监听句柄，整池收尾时关闭 */
let configWatcher: fs.FSWatcher | null = null;
/** 配置重载的防抖定时器 */
let configReloadTimer: ReturnType<typeof setTimeout> | null = null;
/** 每个服务的清单对账防抖定时器，键为服务名 */
const listChangedTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 把池内条目单向投影成注册表条目。
 *
 * 注册表是消费侧唯一事实源，pool 是唯一写入方，连接资产仍留在池内。
 * 同名注册冲突按定论处理，条目落失败态带说明，不阻断其余条目。
 */
function syncRegistryEntry(name: string): void {
  const entry = serverEntries.get(name);
  if (!entry) {
    toolRegistry.unregister(name);
    return;
  }

  const projected: RegistryEntry = {
    id: entry.name,
    kind: entry.agentApp ? 'app' : 'mcp',
    name: entry.config.displayName ?? entry.name,
    description: entry.config.description,
    status: entry.status,
    functions: entry.tools.map((tool) => ({
      name: toFullName(entry.name, tool.name),
      shortName: tool.name,
      description: tool.description,
    })),
    meta: {
      url: entry.config.url,
      logoUrl: getMcpServerLogoUrl(entry),
      instructions: entry.instructions,
      author: entry.config.author,
      error: entry.error,
      oauthUrl: entry.oauthUrl,
    },
  };

  const existing = toolRegistry.get(projected.id);
  if (existing) {
    if (existing.kind === projected.kind) {
      toolRegistry.update(projected.id, projected);
      return;
    }
    // 跨来源撞 id 时后来者整服务落失败，注册表保留既有条目不被覆盖
    entry.status = 'failed';
    entry.error = `Tool entry id '${entry.name}' already registered as kind '${existing.kind}'`;
    Logger.log('ERROR', `Tool entry '${entry.name}' skipped: ${entry.error}`);
    return;
  }
  try {
    toolRegistry.register(projected);
  } catch (error) {
    entry.status = 'failed';
    entry.error = `Duplicate tool entry id '${entry.name}': ${error instanceof Error ? error.message : String(error)}`;
    Logger.log('ERROR', `Tool entry '${entry.name}' skipped: ${entry.error}`);
  }
}

/**
 * 从 config 创建 connecting 状态的 entry，投影 agentApp / supportedUI 字段。
 */
function createConnectingEntry(
  name: string,
  config: McpServerConfig
): McpServerEntry {
  return {
    name,
    config,
    status: 'connecting',
    tools: [],
    agentApp: config.agentApp === true,
    supportedUI: config.supportedUI,
  };
}

/**
 * 把一次连接的结果落进池与 entry。
 * 初始化与运行时新增共用，握手 instructions 在这里写进 entry 供投影透出。
 */
function applyConnectResult(name: string, result: ConnectResult): void {
  if (result.appPort) {
    appPorts.set(name, result.appPort);
  }

  if (result.serverConn) {
    serverConnections.set(name, result.serverConn);
  }

  if (result.connection) {
    connections.set(name, result.connection);
  }

  const entry = serverEntries.get(name);
  if (!entry) return;

  entry.instructions = result.serverConn?.instructions?.trim() || undefined;

  // Agent App 的子进程编号进清账记录，正常收尾除名，漏掉的下次启动回收
  if (entry.agentApp && result.serverConn?.childPid) {
    recordAppPid(name, result.serverConn.childPid, entry.config);
  }

  if (result.connection) {
    entry.status = 'connected';
    entry.tools = result.tools ?? [];
    entry.error = undefined;
  } else if (result.needsAuth) {
    entry.status = 'needs_auth';
    entry.oauthUrl = result.oauthUrl;
    entry.error = undefined;
  } else {
    entry.status = 'failed';
    entry.error = result.error ?? 'Unknown error';
  }

  syncRegistryEntry(name);
}

/**
 * 取一个服务的池侧回调集合，装载、运行时新增与重连共用。
 * 断连落失败态，清单变化进防抖对账，App 通知经全局回调转发。
 */
function handlersFor(name: string): ConnectHandlers {
  return {
    onAppNotification: (params) => appNotificationHandler?.(params, name),
    onClosed: () => handleServerClosed(name),
    onToolListChanged: () => scheduleReconcile(name),
  };
}

/**
 * 连接一个服务并把结果落进池与 entry，运行时新增与重连共用。
 * 连接失败不抛异常，由调用方读 entry 状态决定怎么提示。
 */
async function connectAndApply(
  name: string,
  config: McpServerConfig
): Promise<ConnectResult> {
  const result = await connectOne(name, config, handlersFor(name));

  applyConnectResult(name, result);

  if (result.connection) {
    Logger.log(
      'MCP',
      `Server '${name}' connected at runtime (${result.tools.length} tools)`
    );
  } else if (result.needsAuth) {
    Logger.log('MCP', `Server '${name}' requires OAuth authentication`);
  } else {
    Logger.log(
      'MCP',
      `Server '${name}' failed to connect: ${result.error ?? 'Unknown error'}`
    );
  }
  return result;
}

/**
 * 意外断开落到失败态并广播，不自动重连，恢复统一走手动重载。
 * 主动断开不进这里，见 MCPServerConnection 的 intentionallyClosed 标志。
 */
function handleServerClosed(name: string): void {
  const entry = serverEntries.get(name);
  if (!entry || entry.status !== 'connected') return;

  connections.delete(name);
  serverConnections.delete(name);
  entry.status = 'failed';
  entry.error = 'Connection closed unexpectedly';

  syncRegistryEntry(name);
  Logger.log('MCP', `Server '${name}' closed unexpectedly, marked failed`);
}

/**
 * 清单变化通知进防抖，短时多次合成一次对账。
 */
function scheduleReconcile(name: string): void {
  if (listChangedTimers.has(name)) return;
  const timer = setTimeout(() => {
    listChangedTimers.delete(name);
    void reconcileTools(name);
  }, RECONCILE_DEBOUNCE_MS);
  timer.unref?.();
  listChangedTimers.set(name, timer);
}

/**
 * 对账一个服务的功能清单，全量重拉逐项对比后回注。
 *
 * 刷新只换实例数组不碰连接本身，会话中途换表不打断对话，
 * 装配每条消息取快照，下一轮自然生效。
 */
async function reconcileTools(name: string): Promise<void> {
  const entry = serverEntries.get(name);
  const serverConn = serverConnections.get(name);
  if (!entry || !serverConn || entry.status !== 'connected') return;

  try {
    const tools = await serverConn.refreshTools();
    const before = new Set(entry.tools.map((tool) => tool.name));
    const after = tools.map((tool) => tool.name);
    const added = after.filter((fn) => !before.has(fn));
    const removed = [...before].filter((fn) => !after.includes(fn));

    entry.tools = buildToolMetaList(name, serverConn);
    connections.set(name, {
      name,
      tools,
      disconnect: () => serverConn.disconnect(),
    });

    syncRegistryEntry(name);
    Logger.log(
      'MCP',
      `Reconciled tools for '${name}': ${after.length} functions, +${added.length} -${removed.length}`
    );
  } catch (error: unknown) {
    // TODO: (reconcile-degradation) A failed or premature reconcile silently keeps the old tool list by accepted design ruling, so verify staleness stays acceptable before touching this path.
    Logger.log(
      'MCP',
      `Tool reconcile failed for '${name}': ${errorMessage(error)}`
    );
  }
}

/**
 * 监听 mcp.json，防抖后重跑装载并 diff 出三路分派。
 *
 * 新增条目注册并连接，删除条目注销断开，配置变化的重连一次。
 * diff 无变化不动作，商城安装卸载的双写口触发的监听天然幂等。
 */
function watchMcpConfig(): void {
  try {
    configWatcher = fs.watch(getMcpConfigPath(), { persistent: false }, () => {
      if (configReloadTimer) return;
      configReloadTimer = setTimeout(() => {
        configReloadTimer = null;
        void reloadMcpConfigDiff();
      }, CONFIG_RELOAD_DEBOUNCE_MS);
      configReloadTimer.unref?.();
    });
    configWatcher.unref?.();
  } catch {
    // 配置文件不存在时监听跳过，文件将来创建时由下一次启动接管
    Logger.log('MCP', 'No mcp.json to watch, config reload disabled');
  }
}

/** 重跑装载并 diff 出三路分派，动作记日志，无变化静默 */
async function reloadMcpConfigDiff(): Promise<void> {
  const configs = loadMcpConfig();
  const existingNames = new Set(serverEntries.keys());
  const actions: string[] = [];

  for (const name of existingNames) {
    if (!configs.has(name)) {
      await removeServer(name);
      actions.push(`removed:${name}`);
    }
  }
  for (const [name, config] of configs) {
    if (!existingNames.has(name)) {
      await addServer(name, config);
      actions.push(`added:${name}`);
      continue;
    }
    const current = serverEntries.get(name)?.config;
    if (JSON.stringify(current) !== JSON.stringify(config)) {
      await reconnectServer(name).catch(() => {});
      actions.push(`reconnected:${name}`);
    }
  }

  if (actions.length > 0) {
    Logger.log('MCP', `Config reloaded: ${actions.join(', ')}`);
  }
}

/**
 * Initialize the MCP connection pool.
 * Reads config, then connects to all servers in parallel.
 * Safe to call multiple times - subsequent calls are no-ops.
 */
export async function initMcpPool(): Promise<void> {
  if (initialized) return;

  // 上一场漏下的 App 子进程先按清账记录回收，再拉新的
  await sweepStaleAppPids();

  // 注册表变化统一广播，订阅一次随池生命周期常驻
  registryUnsubscribe = toolRegistry.subscribe(() => emitToolsInvalidated());

  const serverConfigs = loadMcpConfig();
  if (serverConfigs.size === 0) {
    Logger.log('MCP', 'No MCP servers to connect');
    watchMcpConfig();
    initialized = true;
    return;
  }

  for (const [name, config] of serverConfigs) {
    serverEntries.set(name, createConnectingEntry(name, config));
    syncRegistryEntry(name);
  }

  const results = await connectAllServers(serverConfigs, handlersFor);

  for (const result of results) {
    applyConnectResult(result.name, result);
    if (result.needsAuth) {
      Logger.log(
        'MCP',
        `Server '${result.name}' requires OAuth authentication`
      );
    }
  }

  watchMcpConfig();
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
 * 取服务的显示名：配置里的 displayName 优先，缺省回退机器键。
 * 通知前缀与界面展示统一走这里，机器键只出现在工具路由与 Agent 提示词里。
 */
export function getMcpDisplayName(name: string): string {
  return serverEntries.get(name)?.config.displayName ?? name;
}

/**
 * Get the HTTP port allocated for an Agent App.
 * Returns undefined for non-App servers or unknown names.
 */
export function getAppPort(name: string): number | undefined {
  return appPorts.get(name);
}

/**
 * 注册 Agent App 通知回调。
 *
 * 收到 notifications/app 时按 (params, serverName) 调用。
 * 必须在 initMcpPool 之前调用，否则已建立的连接无法收到通知。
 */
export function setAppNotificationHandler(
  handler: (params: Record<string, unknown>, serverName: string) => void
): void {
  appNotificationHandler = handler;
}

/**
 * Get the Tool instances of one connected MCP server.
 * Unknown or not-connected servers return an empty array with a log line,
 * callers treat the missing tools as skipped entries.
 *
 * @param name - MCP server name
 * @returns Tool instances of the server, empty when unavailable
 */
export function getMcpToolsForServer(name: string): Tool[] {
  const entry = serverEntries.get(name);
  if (!entry) {
    Logger.log('MCP', `Server '${name}' not found, skipping its tools`);
    return [];
  }
  if (entry.status !== 'connected') {
    Logger.log(
      'MCP',
      `Server '${name}' is ${entry.status}, skipping its tools`
    );
    return [];
  }
  return connections.get(name)?.tools ?? [];
}

/**
 * 解析一个 MCP server 条目的本地优先 logo 地址。
 * 本地图标文件命中即产出挂内容哈希的路由地址，缺失回退配置里的远程网址。
 * @param entry - 目标 server 条目
 */
export function getMcpServerLogoUrl(entry: McpServerEntry): string | undefined {
  return produceLocalLogoUrl(
    path.join(getMcpServersDir(), entry.name),
    entry.config,
    `/api/mcp/${entry.name}/logo`,
    'MCP',
    entry.name
  );
}

/**
 * 按工具全名反查所属 MCP server 并解析其 logo 地址。
 * 全名前缀即服务名，与拼接侧的 toFullName 成对，直接查服务表一步命中。
 * 内置工具与无图标资产的服务返回 undefined，调用方回退 Wrench 图标。
 * @param toolName - 工具全名
 */
export function getMcpToolLogoUrl(toolName: string): string | undefined {
  const entryId = splitFullName(toolName)?.entryId;
  if (!entryId) return undefined;
  const entry = serverEntries.get(entryId);
  return entry ? getMcpServerLogoUrl(entry) : undefined;
}

/**
 * Get MCP server status info for system prompt generation.
 * Returns server name -> status mapping for the specified names,
 * plus the server-level instructions (if declared at handshake).
 *
 * @param serverNames - List of MCP server names
 * @returns Array of { name, status, instructions? } for prompt inclusion
 */
export function getMcpPromptInfo(
  serverNames: string[]
): Array<{ name: string; status: string; instructions?: string }> {
  return serverNames.map((name) => {
    const entry = serverEntries.get(name);
    const conn = serverConnections.get(name);
    const instructions = conn?.instructions?.trim() || undefined;
    return {
      name,
      status: entry?.status ?? 'unknown',
      instructions,
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
  if (entry.status !== 'needs_auth' && entry.status !== 'failed') {
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
  syncRegistryEntry(name);

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
    onClosed: handlersFor(name).onClosed,
    onToolListChanged: handlersFor(name).onToolListChanged,
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
      entry.instructions = serverConn.instructions?.trim() || undefined;
      syncRegistryEntry(name);
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
    const message = errorMessage(error);
    callback.close();
    pendingOAuth.delete(name);
    entry.status = 'failed';
    entry.error = message;
    syncRegistryEntry(name);
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
      throw new Error(connectResult.error ?? 'Reconnection failed after OAuth');
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
    entry.instructions = serverConn.instructions?.trim() || undefined;
    syncRegistryEntry(name);

    pendingOAuth.set(name, { status: 'done' });
    Logger.log(
      'MCP',
      `OAuth flow completed for '${name}' - ${tools.length} tools loaded`
    );
  } catch (error: unknown) {
    const message = errorMessage(error);
    Logger.log('ERROR', `OAuth flow failed for '${name}': ${message}`);
    entry.status = 'needs_auth';
    entry.error = `OAuth failed: ${message}`;
    syncRegistryEntry(name);
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
    id: `mcp:${name}:${tool.remoteName}`,
    name: tool.remoteName,
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
 * 运行时添加一个 MCP 服务器并连接，商城安装后调用。
 *
 * 注册 entry，status=connecting，connectOne 连接，按结果更新状态。
 * 连接结果可能是 connected / needs_auth / failed——都不抛异常，
 * 由调用方根据返回后 getMcpServer(name) 的 status 决定怎么提示用户。
 *
 * @param name server 名字
 * @param config server 配置，占位符已替换完毕
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

  serverEntries.set(name, createConnectingEntry(name, config));
  syncRegistryEntry(name);

  await connectAndApply(name, config);
}

/**
 * 运行时移除一个 MCP 服务器，商城卸载时调用。
 *
 * 断开连接 → 清理 connections / serverConnections / pendingOAuth / serverEntries。
 * 如果 server 不存在于池中，静默跳过，幂等。
 *
 * @param name server 名字
 */
export async function removeServer(name: string): Promise<void> {
  if (!serverEntries.has(name)) return;

  await disconnectServerHandles(name);

  pendingOAuth.delete(name);
  appPorts.delete(name);
  serverEntries.delete(name);
  toolRegistry.unregister(name);
  removeAppPids([name]);

  Logger.log('MCP', `Server '${name}' removed from pool`);
}

/** 进行中的重连，键为服务名，同键重复调用复用同一个 Promise */
const reconnecting = new Map<string, Promise<void>>();

/**
 * 重连一个已在池中的服务，详情页连接失败后的重试按钮调用。
 *
 * 断开现有连接并清残留句柄，再按原配置重连，结果经
 * connectAndApply 落进池与 entry，不抛连接类异常。
 * in-flight 互斥在 pool 层做，同键并发调用只触发一次实际连接。
 *
 * @param name server 名字
 * @throws 服务不在池中时抛 not found，路由层映射 404
 */
export async function reconnectServer(name: string): Promise<void> {
  const inFlight = reconnecting.get(name);
  if (inFlight) return inFlight;

  const entry = serverEntries.get(name);
  if (!entry) {
    throw new Error(`MCP server '${name}' not found in pool`);
  }

  Logger.log('MCP', `Reconnecting server '${name}'`);

  const task = (async () => {
    await disconnectServerHandles(name);

    appPorts.delete(name);
    entry.status = 'connecting';
    entry.error = undefined;
    syncRegistryEntry(name);

    await connectAndApply(name, entry.config);
  })().finally(() => {
    reconnecting.delete(name);
  });

  reconnecting.set(name, task);
  return task;
}

/**
 * 断开一个服务的两份连接句柄并清出池，移除、重连与整池收尾共用。
 * 断开失败不抛异常，返回是否全部成功，整池收尾据此决定清账记录是否除名。
 */
async function disconnectServerHandles(name: string): Promise<boolean> {
  const conn = connections.get(name);
  const serverConn = serverConnections.get(name);
  connections.delete(name);
  serverConnections.delete(name);

  const jobs: Promise<void>[] = [];
  if (conn) jobs.push(conn.disconnect());
  if (serverConn) jobs.push(serverConn.disconnect());

  const results = await Promise.allSettled(jobs);
  const ok = results.every((r) => r.status === 'fulfilled');
  if (!ok) {
    Logger.log('MCP', `Disconnect failed for '${name}', ignored`);
  }
  return ok;
}

/**
 * 整池收尾，server 退出流程在结束自己之前调用。
 *
 * 并发断开全部服务，单个失败不影响其他服务。
 * 断开干净的服务从清账记录除名，失败的保留给下次启动清账兜底。
 * 收完清空全部池内状态，池回到未初始化形态。
 */
export async function shutdownMcpPool(): Promise<void> {
  const names = Array.from(
    new Set([
      ...connections.keys(),
      ...serverConnections.keys(),
      ...serverEntries.keys(),
    ])
  );
  if (names.length === 0) {
    Logger.log('MCP', 'Pool empty, nothing to shut down');
    return;
  }

  Logger.log('MCP', `Shutting down ${names.length} pooled server(s)`);

  const settled = await Promise.allSettled(
    names.map((name) => disconnectServerHandles(name))
  );
  const reaped: string[] = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      const name = names[i];
      if (name) reaped.push(name);
    }
  });
  removeAppPids(reaped);

  connections.clear();
  serverConnections.clear();
  serverEntries.clear();
  appPorts.clear();
  pendingOAuth.clear();
  reconnecting.clear();

  // 注册表条目随池收尾注销，内置条目归 server 生命周期不在此列
  for (const name of names) {
    toolRegistry.unregister(name);
  }

  // 监听与订阅一并释放，定时器清空，池回到未初始化形态
  configWatcher?.close();
  configWatcher = null;
  if (configReloadTimer) {
    clearTimeout(configReloadTimer);
    configReloadTimer = null;
  }
  for (const timer of listChangedTimers.values()) {
    clearTimeout(timer);
  }
  listChangedTimers.clear();
  registryUnsubscribe?.();
  registryUnsubscribe = null;
  initialized = false;

  Logger.log(
    'MCP',
    `Pool shut down, ${reaped.length}/${names.length} servers reaped cleanly`
  );
}
