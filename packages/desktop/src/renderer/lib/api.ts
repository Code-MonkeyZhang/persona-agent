/**
 * @file renderer/lib/api.ts
 * @description 核心 API 通信层 - 封装所有 HTTP 接口调用与 WebSocket 客户端，提供后端服务地址管理
 */

import type { UIMessage } from '../types/chat';
import type { SessionMeta, Session } from '../types/session';
import type {
  AgentConfig,
  AgentConfigInput,
  AgentConfigUpdate,
} from '../types/agent';
import type { AppConfig } from '../stores/configStore';
import type {
  ServerMessage,
  ClientMessage,
  DeviceType,
  ModelConfig,
  McpServerInfo,
  McpToolInfo,
  McpConnectionType,
  McpOAuthStatus,
  ProviderStatus,
  SkillInfo,
  SkillDetail,
  MarketplaceEntry,
  McpMarketplaceEntry,
  AgentMarketplaceEntry,
  ClonedVoice,
  TtsConfig,
  TtsModel,
  VoiceOption,
  AgentSeedStatus,
  SessionChange,
  SyncSnapshot,
} from '@persona/shared';
import { logger } from './logger';

interface ListAgentsResponse {
  agents: AgentConfig[];
}

interface AgentResponse {
  agent: AgentConfig;
}

interface ListSessionsResponse {
  sessions: SessionMeta[];
}

interface SessionResponse {
  session: Session;
}

interface DeleteSessionResponse {
  success: boolean;
}

const DEFAULT_PORT = 3847;

let cachedBaseUrl: string | null = null;

/**
 * 获取 API 请求的基础 URL。通过 Electron IPC 查询主进程并缓存结果。
 */
export async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }

  if (window.api?.getServerUrl) {
    const url = await window.api.getServerUrl();
    if (url) {
      cachedBaseUrl = url;
      return url;
    }
  }

  return `http://localhost:${DEFAULT_PORT}`;
}

// DTO 类型已迁移至 @persona/shared
export type {
  McpServerInfo,
  McpToolInfo,
  McpConnectionType,
  ProviderStatus,
  SkillInfo,
  SkillDetail,
  MarketplaceEntry,
  McpMarketplaceEntry,
  AgentMarketplaceEntry,
  ClonedVoice,
  TtsConfig,
  TtsModel,
  VoiceOption,
};

interface ListMcpsResponse {
  servers: McpServerInfo[];
}

interface ListSkillsResponse {
  skills: SkillInfo[];
}

interface GetSkillResponse {
  skill: SkillDetail;
}

interface ListMarketplaceSkillsResponse {
  skills: SkillMarketplaceItem[];
}

/** GET /skills 每条多了 logoUrl, 后端拼的 CDN 地址, 无 logo 时为 undefined */
export interface SkillMarketplaceItem extends MarketplaceEntry {
  logoUrl?: string;
}

/** GET /mcps 每条多了 logoUrl, 后端拼的 CDN 地址, 无 logo 时为 undefined */
export interface McpMarketplaceItem extends McpMarketplaceEntry {
  logoUrl?: string;
}

interface ListMarketplaceMcpsResponse {
  mcps: McpMarketplaceItem[];
}

/** install 端点的返回，多了连接状态 */
interface InstallMcpResponse {
  success: boolean;
  name: string;
  status: string;
  error?: string;
}

/** GET /agents 每条多了 logoUrl 和 source, logoUrl 是后端拼的 raw URL, source 是商城来源标识 */
export interface AgentMarketplaceItem extends AgentMarketplaceEntry {
  logoUrl?: string;
  source: string;
}

interface ListMarketplaceAgentsResponse {
  agents: AgentMarketplaceItem[];
}

interface ListProvidersResponse {
  providers: ProviderStatus[];
}

/**
 * WebSocket 客户端，负责与后端建立实时连接、自动重连和消息分发。
 * 聊天消息通过 HTTP POST 发送，WebSocket 仅用于订阅事件流。
 * 连接建立后自动发送 register 注册设备身份，并以 30 秒心跳保活。
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<(msg: ServerMessage) => void> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  /** 指数退避的基准与封顶，断线追平依赖不设次数上限的重连 */
  private static readonly RECONNECT_BASE_DELAY_MS = 1000;
  private static readonly RECONNECT_MAX_DELAY_MS = 30_000;
  private stopped = false;
  private activeSessionIds: Set<string> = new Set();

  private static readonly HEARTBEAT_INTERVAL_MS = 30_000;

  constructor(
    private urlProvider: () => Promise<string>,
    private deviceInfo?: {
      deviceId: string;
      deviceType: DeviceType;
      deviceName: string;
    }
  ) {}

  /**
   * 注册连接状态变化的监听器。
   * @param listener - 连接状态变化时的回调函数
   * @returns 取消监听的函数
   */
  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  /**
   * 建立 WebSocket 连接，重置重连计数，解除停止标记。
   */
  connect(): void {
    this.stopped = false;
    this.reconnectAttempts = 0;
    this.doConnect();
  }

  private doConnect(): void {
    this.urlProvider().then((baseUrl) => {
      const wsUrl = baseUrl.replace(/^http/, 'ws') + '/ws';
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        logger.info('[WebSocket] Connected');
        this.reconnectAttempts = 0;
        this.connectionListeners.forEach((l) => l(true));

        // 注册设备身份
        if (this.deviceInfo) {
          this.send({
            type: 'register',
            ...this.deviceInfo,
          });
        }

        // 重连时重新订阅所有活跃 session
        for (const sessionId of this.activeSessionIds) {
          this.send({
            type: 'subscribe',
            payload: { sessionId },
          });
        }

        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type !== 'pong') {
            logger.info(
              '[WebSocket] ← Received from server:',
              JSON.stringify(msg, null, 2)
            );
          }
          this.listeners.forEach((listener) => listener(msg));
        } catch (error) {
          logger.error(
            '[WebSocket] Failed to parse message:',
            error instanceof Error ? error.message : String(error)
          );
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.connectionListeners.forEach((l) => l(false));
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        // Error event provides no useful information, skip logging
      };
    });
  }

  /**
   * 以线性退避策略尝试重新连接，超过最大次数后停止。
   */
  /**
   * 以指数退避策略尝试重新连接，延迟封顶三十秒且不设次数上限。
   * 断线追平依赖这条不断重连的通道，server 起停周期内连接必须自愈。
   */
  private attemptReconnect(): void {
    if (this.stopped) {
      return;
    }

    const delay = Math.min(
      WebSocketClient.RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      WebSocketClient.RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempts++;
    logger.info(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  /**
   * 关闭连接并停止重连和心跳。
   */
  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 通过 WebSocket 发送原始消息，仅在连接打开时生效。
   * ping 消息因高频不打日志。
   */
  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (msg.type !== 'ping') {
        logger.info(
          '[WebSocket] → Sent to server:',
          JSON.stringify(msg, null, 2)
        );
      }
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 订阅指定会话的事件流。
   * @param sessionId - 要订阅的会话 ID
   */
  subscribe(sessionId: string): void {
    this.activeSessionIds.add(sessionId);
    this.send({ type: 'subscribe', payload: { sessionId } });
  }

  /**
   * 请求服务端中止指定会话的当前生成。
   * 服务端中止后会推送 'aborted' 事件，本方法不等待响应。
   * 不加入 activeSessionIds — abort 是一次性动作，重连不需补发。
   */
  abort(sessionId: string): void {
    this.send({ type: 'abort', payload: { sessionId } });
  }

  /**
   * 启动心跳定时器，周期性发送 ping 防止服务端超时断开。
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, WebSocketClient.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * 停止心跳定时器。
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 注册消息监听器，收到服务端推送时触发。
   * @param listener - 消息回调函数
   * @returns 取消监听的函数
   */
  onMessage(listener: (msg: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/**
 * 构造一条带有自动生成 ID 和当前时间戳的 UIMessage 对象。
 * @param type - 消息类型
 * @param content - 消息文本内容
 * @param extra - 可选的额外字段，合并到消息对象中
 * @returns 完整的 UIMessage 对象
 */
export function createMessage(
  type: UIMessage['type'],
  content: string,
  extra?: Partial<UIMessage>
): UIMessage {
  return {
    id: crypto.randomUUID(),
    type,
    content,
    timestamp: new Date(),
    ...extra,
  };
}

/**
 * 获取指定 agent 下的所有会话列表。
 * @param agentId - Agent ID
 * @returns 会话元数据数组
 */
export async function listSessions(agentId: string): Promise<SessionMeta[]> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/agents/${agentId}/sessions`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.status}`);
  }

  const data: ListSessionsResponse = await response.json();
  return data.sessions;
}

/**
 * 拉全量同步快照，冷启动镜像用。
 * @returns 快照对象，含全部会话消息与服务端最新序号
 */
export async function getSyncSnapshot(): Promise<SyncSnapshot> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/sync/snapshot`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to get sync snapshot: ${response.status}`);
  }
  const data = (await response.json()) as { snapshot: SyncSnapshot };
  return data.snapshot;
}

/** 变更流分页响应 */
interface SyncChangesResponse {
  changes: SessionChange[];
  head: number;
}

/**
 * 按游标分页拉变更流，追平用。
 * @param since - 客户端当前游标
 * @param limit - 单页上限
 * @returns 按序变更与服务端最新序号
 */
export async function getSyncChanges(
  since: number,
  limit: number
): Promise<SyncChangesResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/changes?since=${since}&limit=${limit}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) {
    throw new Error(`Failed to get sync changes: ${response.status}`);
  }
  return (await response.json()) as SyncChangesResponse;
}

/**
 * 为指定 agent 创建一个新会话。
 * @param agentId - Agent ID
 * @param title - 可选的会话标题
 * @returns 创建的会话对象
 */
export async function createSession(
  agentId: string,
  title?: string
): Promise<Session> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/${agentId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }

  const data: SessionResponse = await response.json();
  return data.session;
}

/**
 * 根据 ID 获取指定 agent 下的完整会话。
 * @param agentId - 所属 Agent ID
 * @param id - 会话 ID
 * @returns 包含消息的完整会话对象
 */
export async function getSession(
  agentId: string,
  id: string
): Promise<Session> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/sessions/${id}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.status}`);
  }

  const data: SessionResponse = await response.json();
  return data.session;
}

/**
 * 删除指定 agent 下的某个会话。
 * @param agentId - 所属 Agent ID
 * @param id - 会话 ID
 * @returns 是否删除成功
 */
export async function deleteSession(
  agentId: string,
  id: string
): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/sessions/${id}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.status}`);
  }

  const data: DeleteSessionResponse = await response.json();
  return data.success;
}

interface UpdateSessionInput {
  title?: string;
  workspacePath?: string;
  model?: ModelConfig;
}

/**
 * 更新指定会话的部分字段。
 * @param agentId - 所属 Agent ID
 * @param id - 会话 ID
 * @param input - 要更新的字段
 * @returns 更新后的会话对象
 */
export async function updateSession(
  agentId: string,
  id: string,
  input: UpdateSessionInput
): Promise<Session> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/sessions/${id}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update session: ${response.status}`);
  }

  const data: SessionResponse = await response.json();
  return data.session;
}

/**
 * 通过 HTTP POST 发送聊天消息。调用前应先通过 WebSocket subscribe 订阅会话事件以接收响应。
 * @param agentId - Agent ID
 * @param sessionId - 会话 ID
 * @param content - 消息内容
 * @returns 发送结果；会话忙时携带 pendingId 表示已进待注入缓冲
 */
export async function sendChatMessage(
  agentId: string,
  sessionId: string,
  content: string,
  voiceEnabled?: boolean
): Promise<{
  success: boolean;
  error?: string;
  pendingId?: string;
}> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/sessions/${sessionId}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, voiceEnabled }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Failed to send chat: ${response.status}`);
  }

  return data;
}

/**
 * 从服务器获取全局 agent 配置。
 * @returns 当前的 agent 配置
 */
export async function getConfig(): Promise<AppConfig> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }

  const data = await response.json();
  return data.config;
}

/**
 * 更新全局 agent 配置。
 * @param config - 新的配置对象
 */
export async function updateConfig(config: AppConfig): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        `Failed to update config: ${response.status}`
    );
  }
}

export interface BashStatus {
  ok: boolean;
  path: string | null;
}

/**
 * 查询 server 端 Git Bash 检测结果，通过 /health 端点。
 * @returns bash 可用性及路径
 */
export async function getBashStatus(): Promise<BashStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    return { ok: false, path: null };
  }
  const data = await response.json();
  const bash = data?.requirements?.bash;
  return bash ?? { ok: false, path: null };
}

export interface UvStatus {
  ok: boolean;
  source: 'app' | 'system' | null;
  path: string | null;
  version?: string;
}

/** 查询 uv 运行时状态。 */
export async function getUvStatus(): Promise<UvStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/runtimes`);
  if (!response.ok) return { ok: false, source: null, path: null };
  const data = await response.json();
  return (
    (data as { uv?: UvStatus }).uv ?? {
      ok: false,
      source: null,
      path: null,
    }
  );
}

/** 一键安装 uv 运行时，下载二进制 + Python 解释器。 */
export async function installUv(): Promise<UvStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/runtimes/uv/install`, {
    method: 'POST',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to install uv: ${response.status}`
    );
  }
  const data = await response.json();
  return (data as { uv: UvStatus }).uv;
}

/**
 * 获取所有 agent 列表。
 * @returns agent 数组
 */
export async function listAgents(): Promise<AgentConfig[]> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/agents`;
  logger.info(`[API] GET ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  logger.info(`[API] GET ${url} → status ${response.status}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[API] GET ${url} failed: ${response.status} ${body}`);
    throw new Error(`Failed to list agents: ${response.status}`);
  }

  const data: ListAgentsResponse = await response.json();
  logger.info(`[API] GET ${url} response body:`, JSON.stringify(data, null, 2));
  return data.agents;
}

/**
 * 获取初始 Agent 播种状态。
 * 读取失败时 server 返回 seeded: false，向导触发判定据此跳过。
 * @returns 播种状态对象
 */
export async function getSeedStatus(): Promise<AgentSeedStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/seed-status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get seed status: ${response.status}`);
  }

  return response.json();
}

/**
 * 根据 ID 获取单个 agent 的详细信息。
 * @param id - Agent ID
 * @returns agent 对象
 */
export async function getAgent(id: string): Promise<AgentConfig> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/api/agents/${id}`;
  logger.info(`[API] GET ${url}`);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  logger.info(`[API] GET ${url} → status ${response.status}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error(`[API] GET ${url} failed: ${response.status} ${body}`);
    throw new Error(`Failed to get agent: ${response.status}`);
  }

  const data: AgentResponse = await response.json();
  logger.info(`[API] GET ${url} response body:`, JSON.stringify(data, null, 2));
  return data.agent;
}

/**
 * 创建一个新的 agent。
 * @param input - 创建参数
 * @returns 创建的 agent 对象
 */
export async function createAgent(
  input: AgentConfigInput
): Promise<AgentConfig> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to create agent: ${response.status}`);
  }

  const data: AgentResponse = await response.json();
  return data.agent;
}

/**
 * 更新指定 agent 的配置。
 * @param id - Agent ID
 * @param input - 更新参数
 * @returns 更新后的 agent 对象
 */
export async function updateAgent(
  id: string,
  input: AgentConfigUpdate
): Promise<AgentConfig> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to update agent: ${response.status}`);
  }

  const data: AgentResponse = await response.json();
  return data.agent;
}

/**
 * 删除指定 agent。
 * @param id - Agent ID
 * @returns 是否删除成功
 */
export async function deleteAgent(id: string): Promise<boolean> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete agent: ${response.status}`);
  }

  const data = await response.json();
  return data.success;
}

/**
 * 把后端下发的相对图标地址补全为绝对地址。
 * 已安装商品的图标由服务端下发本地路由的相对路径，本机、局域网与隧道
 * 的 baseUrl 各不相同，远程回退网址原样保留。
 */
function withAbsoluteLogoUrl<T extends { logoUrl?: string }>(
  item: T,
  baseUrl: string
): T {
  if (item.logoUrl && item.logoUrl.startsWith('/')) {
    return { ...item, logoUrl: baseUrl + item.logoUrl };
  }
  return item;
}

/**
 * 获取已连接的 MCP 服务器列表。
 * 图标地址经相对路径补全，已装商品走本机服务，断网也能显示。
 * @returns MCP 服务器数组
 */
export async function listMcpServers(): Promise<McpServerInfo[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list MCP servers: ${response.status}`);
  }

  const data: ListMcpsResponse = await response.json();
  return data.servers.map((server) => withAbsoluteLogoUrl(server, baseUrl));
}

/**
 * 重连一个连接失败的 MCP 服务器。
 * 服务端对同名服务的并发重连做了互斥，重复调用复用同一次连接。
 * @param name - MCP 服务器名称
 */
export async function reconnectMcp(name: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/mcp/${encodeURIComponent(name)}/reconnect`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to reconnect: ${response.status}`
    );
  }
}

/**
 * 启动指定 MCP 服务器的 OAuth 授权流程。
 * 返回授权 URL，前端应使用 shell.openExternal 打开浏览器。
 * @param name - MCP 服务器名称
 * @returns 包含授权 URL 的对象
 */
export async function startMcpOAuth(
  name: string
): Promise<{ authorizationUrl: string }> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/mcp/${encodeURIComponent(name)}/oauth/authorize`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to start OAuth: ${response.status}`
    );
  }

  return response.json();
}

/**
 * 查询指定 MCP 服务器的 OAuth 授权状态，用于前端轮询。
 * @param name - MCP 服务器名称
 */
export async function getMcpOAuthStatus(name: string): Promise<McpOAuthStatus> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/mcp/${encodeURIComponent(name)}/oauth/status`,
    { method: 'GET', headers: { Accept: 'application/json' } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get OAuth status: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取可用的技能列表。
 * 图标地址经相对路径补全，已装商品走本机服务，断网也能显示。
 * @returns 技能数组
 */
export async function listSkills(): Promise<SkillInfo[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/skills`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list skills: ${response.status}`);
  }

  const data: ListSkillsResponse = await response.json();
  return data.skills.map((skill) => withAbsoluteLogoUrl(skill, baseUrl));
}

/**
 * 获取单个技能的完整详情，正文按需单查。
 * 图标地址与列表同口径补全。
 * @param name - 技能的机器键
 * @returns 含正文的技能详情
 */
export async function getSkill(name: string): Promise<SkillDetail> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/skills/${encodeURIComponent(name)}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get skill: ${response.status}`);
  }

  const data: GetSkillResponse = await response.json();
  return withAbsoluteLogoUrl(data.skill, baseUrl);
}

/**
 * 拉取商城 Skill 清单。
 * @returns 商城条目数组，每条附带可选 logoUrl
 */
export async function listMarketplaceSkills(): Promise<SkillMarketplaceItem[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/marketplace/skills`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to list marketplace skills: ${response.status}`
    );
  }
  const data: ListMarketplaceSkillsResponse = await response.json();
  return data.skills;
}

/**
 * 安装一个商城 Skill。
 * @param name - Skill 文件夹名
 */
export async function installMarketplaceSkill(name: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/marketplace/skills/${encodeURIComponent(name)}/install`,
    { method: 'POST' }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to install skill: ${response.status}`
    );
  }
}

/**
 * 卸载一个本地 Skill。阶段 5 用。
 * @param name - Skill 文件夹名
 */
export async function uninstallSkill(name: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/marketplace/skills/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to uninstall skill: ${response.status}`
    );
  }
}

/**
 * 拉取 MCP 商城清单。
 * @returns 商城条目数组，每条含 logoUrl
 */
export async function listMarketplaceMcps(): Promise<McpMarketplaceItem[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/marketplace/mcps`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to list marketplace MCPs: ${response.status}`
    );
  }
  const data: ListMarketplaceMcpsResponse = await response.json();
  return data.mcps;
}

/**
 * 安装一个商城 MCP，一键安装无表单。
 * @param name MCP 文件夹名
 */
export async function installMarketplaceMcp(
  name: string
): Promise<InstallMcpResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/marketplace/mcps/${encodeURIComponent(name)}/install`,
    { method: 'POST' }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to install MCP: ${response.status}`
    );
  }
  return response.json();
}

/**
 * 卸载一个 MCP。
 * @param name MCP 文件夹名
 */
export async function uninstallMcp(name: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/marketplace/mcps/${encodeURIComponent(name)}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to uninstall MCP: ${response.status}`
    );
  }
}

/**
 * 拉取 Agent 商城清单。
 * @returns 商城条目数组, 每条含 logoUrl
 */
export async function listMarketplaceAgents(): Promise<AgentMarketplaceItem[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/marketplace/agents`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to list marketplace agents: ${response.status}`
    );
  }
  const data: ListMarketplaceAgentsResponse = await response.json();
  return data.agents;
}

/**
 * 从商城安装一个 Agent。
 * 后端会下载商品包、创建新 Agent、复制资产、注册 SessionManager。
 * @param name Agent 文件夹名
 * @returns 新创建的 AgentConfig, 含新 ID
 */
export async function installMarketplaceAgent(
  name: string
): Promise<AgentConfig> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/marketplace/agents/${encodeURIComponent(name)}/install`,
    { method: 'POST' }
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to install agent: ${response.status}`
    );
  }
  const data: { agent: AgentConfig } = await response.json();
  return data.agent;
}

/**
 * 获取所有可用的模型提供商信息。
 * @returns 提供商信息数组
 */
export async function listProviders(): Promise<ProviderStatus[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/providers`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list providers: ${response.status}`);
  }

  const data: ListProvidersResponse = await response.json();
  return data.providers;
}

export interface VerifyResult {
  valid: boolean;
  models?: string[];
  error?: string;
}

interface CredentialResponse {
  provider: string;
  apiKey: string;
}

/**
 * 为指定提供商设置 API 密钥。
 * @param provider - 提供商名称
 * @param apiKey - API 密钥
 * @returns 包含提供商和密钥的确认信息
 */
export async function setCredential(
  provider: string,
  apiKey: string
): Promise<CredentialResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/${provider}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set credential: ${response.status}`);
  }

  return response.json();
}

/**
 * 验证指定提供商的 API 密钥是否有效。
 * @param provider - 提供商名称
 * @param apiKey - 可选的 API 密钥，不传则验证已存储的密钥
 * @returns 验证结果，包含有效性标志和可选的错误信息
 */
export async function verifyCredential(
  provider: string,
  apiKey?: string
): Promise<VerifyResult> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/${provider}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    throw new Error(`Failed to verify credential: ${response.status}`);
  }

  return response.json();
}

interface TunnelStatusResponse {
  status: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
  health: 'unknown' | 'healthy' | 'unhealthy';
  onlineDevices: Array<{
    deviceId: string;
    deviceType: DeviceType;
    deviceName: string;
  }>;
}

/**
 * 启动远程隧道。
 * @returns 包含状态信息的对象
 */
export async function startTunnel(): Promise<{ status: string }> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tunnel/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to start tunnel: ${response.status}`);
  }

  return response.json();
}

/**
 * 停止远程隧道。
 * @returns 是否成功停止
 */
export async function stopTunnel(): Promise<{ success: boolean }> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tunnel/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to stop tunnel: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取远程隧道的当前状态。
 * @returns 隧道状态信息
 */
export async function getTunnelStatus(): Promise<TunnelStatusResponse> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tunnel/status`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get tunnel status: ${response.status}`);
  }

  return response.json();
}

interface AvatarResponse {
  success: boolean;
}

/**
 * 删除指定提供商的已存储凭据。
 * @param provider - 提供商名称
 * @returns 是否删除成功
 */
export async function deleteCredential(
  provider: string
): Promise<{ success: boolean }> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/auth/${provider}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete credential: ${response.status}`);
  }

  return response.json();
}

/**
 * 获取指定 agent 的头像 URL，内容哈希承担缓存身份。
 * @param agentId - Agent ID
 * @param hash - 头像内容哈希，为空时不带参数
 * @returns 头像图片的完整 URL
 */
export function getAgentAvatarUrl(agentId: string, hash?: string): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  const query = hash ? `?h=${hash}` : '';
  return `${base}/api/agents/${agentId}/avatar${query}`;
}

/**
 * 获取指定 agent 的姿态图片 URL，内容哈希承担缓存身份。
 * @param agentId - Agent ID
 * @param poseName - 姿态名称
 * @param hash - 姿态图片内容哈希，为空时不带参数
 * @returns 姿态图片的完整 URL
 */
export function getPoseImageUrl(
  agentId: string,
  poseName: string,
  hash?: string
): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  const query = hash ? `?h=${hash}` : '';
  return `${base}/api/agents/${agentId}/assets/pose/${encodeURIComponent(poseName)}${query}`;
}

/**
 * 获取指定 agent 的背景图片 URL，内容哈希承担缓存身份。
 * @param agentId - Agent ID
 * @param hash - 背景内容哈希，为空时不带参数
 * @returns 背景图片的完整 URL
 */
export function getBackgroundImageUrl(agentId: string, hash?: string): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  const query = hash ? `?h=${hash}` : '';
  return `${base}/api/agents/${agentId}/assets/background${query}`;
}

/** 立绘素材条目，name 承担业务查找，hash 承担缓存身份 */
export interface PoseAsset {
  name: string;
  hash: string;
}

/** 素材列表响应，poses 为立绘哈希清单，backgroundHash 为背景哈希 */
export interface PoseAssets {
  poses: PoseAsset[];
  backgroundHash: string;
}

/**
 * 获取指定 agent 的立绘清单与背景哈希。
 * @param agentId - Agent ID
 * @returns 立绘哈希清单与背景哈希，背景不存在时哈希为空串
 */
export async function listPoses(agentId: string): Promise<PoseAssets> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/${agentId}/assets/pose`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to list poses: ${response.status}`);
  }
  return (await response.json()) as PoseAssets;
}

/**
 * 上传指定 agent 的头像图片。
 * @param agentId - Agent ID
 * @param file - 图片文件
 * @returns 上传结果
 */
export async function uploadAvatar(
  agentId: string,
  file: File
): Promise<AvatarResponse> {
  const baseUrl = await getBaseUrl();
  const formData = new FormData();
  formData.append('avatar', file);

  const response = await fetch(`${baseUrl}/api/agents/${agentId}/avatar`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload avatar: ${response.status}`);
  }

  return response.json();
}

/**
 * 上传立绘图片。以 poseName 作为文件名，扩展名取自上传文件。
 */
export async function uploadPoseImage(
  agentId: string,
  poseName: string,
  file: File
): Promise<{ success: boolean }> {
  const baseUrl = await getBaseUrl();
  const formData = new FormData();
  formData.append('pose', file);

  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/assets/pose/${encodeURIComponent(poseName)}`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    throw new Error(`Failed to upload pose image: ${response.status}`);
  }

  return response.json();
}

/**
 * 删除指定名称的立绘图片。
 */
export async function deletePoseImage(
  agentId: string,
  poseName: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/assets/pose/${encodeURIComponent(poseName)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete pose image: ${response.status}`);
  }
}

/**
 * 重命名立绘图片。服务端执行 fs.rename，比重新上传更轻量。
 */
export async function renamePoseImage(
  agentId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/assets/pose/${encodeURIComponent(oldName)}/rename`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to rename pose image: ${response.status}`);
  }
}

/**
 * 上传背景图。背景图只保留一张，服务端上传前会自动清理已有图片。
 */
export async function uploadBackgroundImage(
  agentId: string,
  file: File
): Promise<{ success: boolean }> {
  const baseUrl = await getBaseUrl();
  const formData = new FormData();
  formData.append('background', file);

  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/assets/background`,
    { method: 'POST', body: formData }
  );

  if (!response.ok) {
    throw new Error(`Failed to upload background image: ${response.status}`);
  }

  return response.json();
}

/**
 * 删除背景图。
 */
export async function deleteBackgroundImage(agentId: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/assets/background`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete background image: ${response.status}`);
  }
}

export async function getTtsConfig(): Promise<TtsConfig> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tts/config`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get TTS config: ${response.status}`);
  }

  const data = await response.json();
  return data.config;
}

export async function updateTtsConfig(
  updates: Partial<Pick<TtsConfig, 'apiKey' | 'model' | 'summaryThreshold'>>
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tts/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to update TTS config: ${response.status}`
    );
  }
}

export async function getTtsModels(): Promise<TtsModel[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/tts/models`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get TTS models: ${response.status}`);
  }

  const data = await response.json();
  return data.models;
}

export async function getVoices(): Promise<VoiceOption[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/voices`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to get voices: ${response.status}`);
  }

  const data = await response.json();
  return data.voices;
}

export async function cloneVoice(
  file: File,
  voiceId: string,
  name: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('voice_id', voiceId);
  formData.append('name', name);

  const response = await fetch(`${baseUrl}/api/voices/clone`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to clone voice: ${response.status}`
    );
  }
}

export async function deleteClonedVoice(voiceId: string): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/voices/clone/${encodeURIComponent(voiceId)}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to delete cloned voice: ${response.status}`
    );
  }
}

/** 重命名克隆音色，只改服务端本地配置不调 MiniMax 接口 */
export async function renameClonedVoice(
  voiceId: string,
  name: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/voices/clone/${encodeURIComponent(voiceId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ||
        `Failed to rename cloned voice: ${response.status}`
    );
  }
}
