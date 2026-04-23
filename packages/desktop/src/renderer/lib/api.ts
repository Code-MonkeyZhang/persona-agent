/**
 * @file renderer/lib/api.ts
 * @description 核心 API 通信层 - 封装所有 HTTP 接口调用与 WebSocket 客户端，提供后端服务地址管理
 */

import type { Message } from '../types/chat';
import type { ServerMessage } from '../types/chat';
import type {
  SessionMeta,
  Session,
  ListSessionsResponse,
  SessionResponse,
  DeleteSessionResponse,
} from '../types/session';
import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  ListAgentsResponse,
  AgentResponse,
} from '../types/agent';
import type { AgentConfig } from '../stores/configStore';
import { logger } from './logger';

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

export interface McpServer {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  toolCount?: number;
  error?: string;
}

export interface ListMcpsResponse {
  servers: McpServer[];
}

export interface Skill {
  name: string;
  description?: string;
}

export interface ListSkillsResponse {
  skills: Skill[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  hasAuth: boolean;
  models: string[];
}

export interface ListProvidersResponse {
  providers: ProviderInfo[];
}

/**
 * 检查后端服务器是否可达，请求 /api/status 端点。
 * @returns 服务器是否正常响应
 */
export async function checkServerStatus(): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl();
    const response = await fetch(`${baseUrl}/api/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    return response.ok;
  } catch (error) {
    logger.error('[API] Failed to check server status:', error);
    return false;
  }
}

/**
 * WebSocket 客户端，负责与后端建立实时连接、自动重连和消息分发。
 * 聊天消息通过 HTTP POST 发送，WebSocket 仅用于订阅事件流。
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Set<(msg: ServerMessage) => void> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private currentSessionId: string | null = null;

  constructor(private urlProvider: () => Promise<string>) {}

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
   * 建立 WebSocket 连接，重置重连计数。
   */
  connect(): void {
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

        if (this.currentSessionId) {
          this.send({
            type: 'subscribe',
            payload: { sessionId: this.currentSessionId },
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          logger.info(
            '[WebSocket] ← Received from server:',
            JSON.stringify(msg, null, 2)
          );
          this.listeners.forEach((listener) => listener(msg));
        } catch (error) {
          logger.error(
            '[WebSocket] Failed to parse message:',
            error instanceof Error ? error.message : String(error)
          );
        }
      };

      this.ws.onclose = () => {
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
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[WebSocket] Connection failed after max retries');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    logger.info(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  /**
   * 关闭连接并停止重连尝试。
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.ws?.close();
    this.ws = null;
  }

  /**
   * 通过 WebSocket 发送原始消息，仅在连接打开时生效。
   */
  private send(
    msg:
      | { type: 'subscribe'; payload: { sessionId: string } }
      | { type: 'unsubscribe'; payload: { sessionId: string } }
      | { type: 'ping' }
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.info(
        '[WebSocket] → Sent to server:',
        JSON.stringify(msg, null, 2)
      );
      this.ws.send(JSON.stringify(msg));
    }
  }

  /**
   * 订阅指定会话的事件流。
   * @param sessionId - 要订阅的会话 ID
   */
  subscribe(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.send({ type: 'subscribe', payload: { sessionId } });
  }

  /**
   * 取消订阅指定会话的事件流。
   * @param sessionId - 要取消订阅的会话 ID
   */
  unsubscribe(sessionId: string): void {
    this.send({ type: 'unsubscribe', payload: { sessionId } });
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
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

  /**
   * 判断 WebSocket 是否处于已连接状态。
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * 构造一条带有自动生成 ID 和当前时间戳的 Message 对象。
 * @param type - 消息类型（user、assistant、error 等）
 * @param content - 消息文本内容
 * @param extra - 可选的额外字段，合并到消息对象中
 * @returns 完整的 Message 对象
 */
export function createMessage(
  type: Message['type'],
  content: string,
  extra?: Partial<Message>
): Message {
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
 * 根据 ID 获取指定 agent 下的完整会话（含消息）。
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

export interface UpdateSessionInput {
  title?: string;
  workspacePath?: string;
  model?: { provider: string; model: string };
}

/**
 * 更新指定会话的部分字段（标题、工作区路径、模型等）。
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
 * @returns 发送结果，包含 success 标志和可选的 error 信息
 */
export async function sendChatMessage(
  agentId: string,
  sessionId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(
    `${baseUrl}/api/agents/${agentId}/sessions/${sessionId}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
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
export async function getConfig(): Promise<AgentConfig> {
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
export async function updateConfig(config: AgentConfig): Promise<void> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      errorData.message || `Failed to update config: ${response.status}`
    );
  }
}

/**
 * 获取所有 agent 列表。
 * @returns agent 数组
 */
export async function listAgents(): Promise<Agent[]> {
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
 * 根据 ID 获取单个 agent 的详细信息。
 * @param id - Agent ID
 * @returns agent 对象
 */
export async function getAgent(id: string): Promise<Agent> {
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
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
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
  input: UpdateAgentInput
): Promise<Agent> {
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
 * 获取已连接的 MCP 服务器列表。
 * @returns MCP 服务器数组
 */
export async function listMcpServers(): Promise<McpServer[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/mcp`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list MCP servers: ${response.status}`);
  }

  const data: ListMcpsResponse = await response.json();
  return data.servers;
}

/**
 * 获取可用的技能列表。
 * @returns 技能数组
 */
export async function listSkills(): Promise<Skill[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/skills`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to list skills: ${response.status}`);
  }

  const data: ListSkillsResponse = await response.json();
  return data.skills;
}

/**
 * 获取所有可用的模型提供商信息。
 * @returns 提供商信息数组
 */
export async function listProviders(): Promise<ProviderInfo[]> {
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

export interface CredentialResponse {
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

export interface TunnelStatusResponse {
  status: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
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
  avatar?: string;
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
 * 获取指定 agent 的头像 URL，附带时间戳参数避免缓存。
 * @param agentId - Agent ID
 * @returns 头像图片的完整 URL
 */
export function getAgentAvatarUrl(agentId: string): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  return `${base}/api/agents/${agentId}/avatar?t=${Date.now()}`;
}

/**
 * 获取指定 agent 的姿态图片 URL。
 * @param agentId - Agent ID
 * @param poseName - 姿态名称
 * @returns 姿态图片的完整 URL
 */
export function getPoseImageUrl(agentId: string, poseName: string): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  return `${base}/api/agents/${agentId}/assets/pose/${encodeURIComponent(poseName)}?t=${Date.now()}`;
}

/**
 * 获取指定 agent 的背景图片 URL。
 * @param agentId - Agent ID
 * @returns 背景图片的完整 URL
 */
export function getBackgroundImageUrl(agentId: string): string {
  const base = cachedBaseUrl || `http://localhost:${DEFAULT_PORT}`;
  return `${base}/api/agents/${agentId}/assets/background?t=${Date.now()}`;
}

/**
 * 获取指定 agent 可用的姿态列表。
 * @param agentId - Agent ID
 * @returns 姿态名称数组
 */
export async function listPoses(agentId: string): Promise<string[]> {
  const baseUrl = await getBaseUrl();
  const response = await fetch(`${baseUrl}/api/agents/${agentId}/assets/pose`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to list poses: ${response.status}`);
  }
  const data = await response.json();
  return data.poses;
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
