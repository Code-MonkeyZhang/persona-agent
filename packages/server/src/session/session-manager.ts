/**
 * @fileoverview Session management operations.
 */

import { randomUUID } from 'node:crypto';
import { SessionStore } from './store.js';
import type { Session, SessionMeta, CreateSessionOptions } from './types.js';
import type { AgentConfig, ModelConfig } from '../agent/types.js';
import type { Message } from '../schema/index.js';
import { getAgentConfig } from '../agent/agent-config-store.js';
import { Logger } from '../util/logger.js';
import { mixTurnEnds } from '@persona/shared';

/**
 * Generate a human-readable session ID using local time + short UUID.
 *
 * Format: `YYYYMMDD-HHmmss-xxxxxxxx` (e.g. `20260616-143000-a1b2c3d4`).
 * The timestamp makes filenames sortable and identifiable at a glance;
 * the 8-char UUID suffix guarantees uniqueness within the same second.
 */
function generateSessionId(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const shortId = randomUUID().slice(0, 8);
  return `${date}-${time}-${shortId}`;
}

export class SessionManager {
  /**
   * 计算指定 Agent 的常驻聊天会话 ID。
   *
   * 形如 `chat-{agentId}`，全局唯一——避免不同 Agent 的聊天会话在前端缓存
   * 与 WebSocket 路由中因同名而串台。是否为聊天会话可用 `id.startsWith('chat')` 判断。
   */
  static chatSessionIdFor(agentId: string): string {
    return `chat-${agentId}`;
  }

  constructor(
    private readonly store: SessionStore,
    private readonly agentId: string
  ) {}

  /** 当前 Agent 的常驻聊天会话 ID。 */
  chatSessionId(): string {
    return SessionManager.chatSessionIdFor(this.agentId);
  }

  /** List all sessions for this agent, sorted by updatedAt descending */
  listSessions(): SessionMeta[] {
    return this.store
      .listSessionFiles()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Create a new session.
   *
   * The model stays empty on purpose; it is frozen from the agent default
   * by {@link ensureModel} when the first message is sent.
   */
  createSession(options: CreateSessionOptions = {}): Session {
    const agentConfig = getAgentConfig(this.agentId);
    if (!agentConfig) {
      throw new Error(`Agent config not found: ${this.agentId}`);
    }

    const id = generateSessionId();
    const now = Date.now();

    const session: Session = {
      id,
      agentId: this.agentId,
      title: options.title || 'New Session',
      createdAt: now,
      updatedAt: now,
      messages: [],
      workspacePath: agentConfig.defaultWorkspacePath,
    };

    this.store.createSessionFile(session);
    return session;
  }

  /**
   * Create the persistent chat session with a per-agent unique ID and title.
   *
   * Unlike `createSession`, this uses {@link chatSessionId} as the ID
   * and `"聊天"` as the title. The caller should check `getSession` first
   * to avoid overwriting an existing chat session.
   *
   * The model stays empty on purpose; it is frozen from the agent default
   * by {@link ensureModel} when the first message is sent, so a default
   * chosen later in onboarding is never shadowed by a stale copy.
   */
  createChatSession(): Session {
    const agentConfig = getAgentConfig(this.agentId);
    if (!agentConfig) {
      throw new Error(`Agent config not found: ${this.agentId}`);
    }

    const now = Date.now();
    const session: Session = {
      id: this.chatSessionId(),
      agentId: this.agentId,
      title: '聊天',
      createdAt: now,
      updatedAt: now,
      messages: [],
      workspacePath: agentConfig.defaultWorkspacePath,
    };

    this.store.createSessionFile(session);
    return session;
  }

  /** Get a session by ID */
  getSession(id: string): Session | null {
    return this.store.loadSession(id);
  }

  /**
   * 客户端视角的会话消息流。
   *
   * 按 turnEnds 记录的消息数把边界条目混入 messages 副本，
   * 混入规则在 shared，与桌面端缓存共用同一实现。
   * - 边界条目借用 system 角色与 turnEnd 标志，走既有 system 跳过规则的消费方自然兼容
   * - 内部消费方继续使用 getSession，数组不含边界，下标语义不变
   */
  getSessionForClient(id: string): Session | null {
    const session = this.getSession(id);
    if (!session?.turnEnds?.length) return session;
    return {
      ...session,
      messages: mixTurnEnds(session.messages, session.turnEnds),
    };
  }

  /** Delete a session */
  deleteSession(id: string): boolean {
    return this.store.deleteSessionFile(id);
  }

  /**
   * Append a message to a session file.
   * @returns `true` on success, `false` if session not found
   */
  appendMessage(id: string, message: Message): boolean {
    return this.store.appendMessageLine(id, message);
  }

  /**
   * Append a turn end marker line to a session file.
   * @returns `true` on success, `false` if session not found
   */
  appendTurnEnd(id: string): boolean {
    return this.store.appendTurnEndLine(id);
  }

  /** Update session title */
  updateTitle(id: string, title: string): Session | null {
    return this.updateSessionField(id, { title });
  }

  /** Update session workspace path */
  updateWorkspacePath(id: string, workspacePath: string): Session | null {
    return this.updateSessionField(id, { workspacePath });
  }

  /**
   * 首次使用时固化会话模型。
   *
   * 会话创建时不再照抄 Agent 默认模型,出生到首次发送之间 model 保持空,
   * 界面与发送链路在空值期间按 Agent 默认值回落。本方法在发送链路开头调用,
   * 已有模型直接返回,没有则取当前 Agent 默认值写入会话并返回,
   * 此后会话模型不再跟随默认值变化。
   *
   * @param id - Session 唯一标识符
   * @param agentConfig - 会话所属 Agent 的配置
   * @returns 固化后的模型配置,会话不存在时返回 null
   */
  ensureModel(id: string, agentConfig: AgentConfig): ModelConfig | null {
    const session = this.getSession(id);
    if (!session) return null;
    if (session.model) return session.model;

    const updated = this.updateModel(id, agentConfig.defaultModel);
    Logger.log('SESSION', 'Model frozen from agent default', {
      sessionId: id,
      agentId: this.agentId,
      provider: agentConfig.defaultModel.provider,
      model: agentConfig.defaultModel.model,
    });
    return updated?.model ?? agentConfig.defaultModel;
  }

  /** Update session model */
  updateModel(id: string, model: ModelConfig | undefined): Session | null {
    return this.updateSessionField(id, { model });
  }

  /** Update session pose (companion display) */
  updatePose(id: string, pose: string): Session | null {
    return this.updateSessionField(id, { currentPose: pose });
  }

  /**
   * 更新聊天 Session 的压缩进度指针。
   *
   * 压缩完成后由 compress-service 调用，推进 `summarizedUpTo`；
   * 仅重写 JSONL 首行元数据，消息行不受影响。
   */
  updateSummarizedUpTo(id: string, summarizedUpTo: number): Session | null {
    return this.updateSessionField(id, { summarizedUpTo });
  }

  /**
   * Generic session field update.
   *
   * Loads the session, applies the updates, then rewrites only the
   * metadata (first line) of the JSONL file — message lines are preserved.
   */
  private updateSessionField(
    id: string,
    updates: Partial<Session>
  ): Session | null {
    const session = this.store.loadSession(id);
    if (!session) {
      return null;
    }

    Object.assign(session, updates, { updatedAt: Date.now() });

    const { messages: _messages, ...meta } = session;
    this.store.rewriteMetaLine(id, meta);
    return session;
  }
}
