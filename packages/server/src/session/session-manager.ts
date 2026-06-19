/**
 * @fileoverview Session management operations.
 */

import { randomUUID } from 'node:crypto';
import { SessionStore } from './store.js';
import type { Session, SessionMeta, CreateSessionOptions } from './types.js';
import type { ModelConfig } from '../agent/types.js';
import type { Message } from '../schema/index.js';
import { getAgentConfig } from '../agent/agent-config-store.js';

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
  /** Fixed ID for the persistent chat session */
  static readonly CHAT_SESSION_ID = 'chat';

  constructor(
    private readonly store: SessionStore,
    private readonly agentId: string
  ) {}

  /** List all sessions for this agent, sorted by updatedAt descending */
  listSessions(): SessionMeta[] {
    return this.store
      .listSessionFiles()
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Create a new session */
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
      model: agentConfig.defaultModel,
    };

    this.store.createSessionFile(session);
    return session;
  }

  /**
   * Create the persistent chat session with a fixed ID and title.
   *
   * Unlike `createSession`, this uses {@link CHAT_SESSION_ID} as the ID
   * and `"聊天"` as the title. The caller should check `getSession` first
   * to avoid overwriting an existing chat session.
   */
  createChatSession(): Session {
    const agentConfig = getAgentConfig(this.agentId);
    if (!agentConfig) {
      throw new Error(`Agent config not found: ${this.agentId}`);
    }

    const now = Date.now();
    const session: Session = {
      id: SessionManager.CHAT_SESSION_ID,
      agentId: this.agentId,
      title: '聊天',
      createdAt: now,
      updatedAt: now,
      messages: [],
      workspacePath: agentConfig.defaultWorkspacePath,
      model: agentConfig.defaultModel,
    };

    this.store.createSessionFile(session);
    return session;
  }

  /** Get a session by ID */
  getSession(id: string): Session | null {
    return this.store.loadSession(id);
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

  /** Update session title */
  updateTitle(id: string, title: string): Session | null {
    return this.updateSessionField(id, { title });
  }

  /** Update session workspace path */
  updateWorkspacePath(id: string, workspacePath: string): Session | null {
    return this.updateSessionField(id, { workspacePath });
  }

  /** Update session model */
  updateModel(id: string, model: ModelConfig | undefined): Session | null {
    return this.updateSessionField(id, { model });
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

    const { messages, ...meta } = session;
    this.store.rewriteMetaLine(id, meta);
    return session;
  }
}
