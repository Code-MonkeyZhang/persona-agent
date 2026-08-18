/**
 * @fileoverview Session file storage operations (JSONL).
 *
 * Storage structure:
 * {agentDir}/
 * ├── sessions/
 * │   └── {sessionId}.jsonl    # One JSONL file per session
 *
 * Each file's first line is a session_meta entry; subsequent lines are
 * message entries. All writes are append-only except meta-line rewrites.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentSessionsDir } from '../util/paths.js';
import { buildPreviewText } from '@persona/shared';
import type { Session, SessionMeta } from './types.js';
import type { Message, UserMessage } from '../schema/index.js';

/** Internal shape of one JSONL line */
interface SessionLine {
  timestamp: string;
  type: 'session_meta' | 'message';
  data: unknown;
}

/**
 * 提取一条消息的纯文本，供预览使用。
 *
 * - 仅认 user / assistant 角色，其余角色（context、system、error、app_notification）返回 undefined
 * - user 的 content 兼容纯字符串与 ContentBlock 数组，数组取各 block 的 text 拼接
 * - assistant 纯工具步（无 content）返回 undefined，由调用方继续往前找
 */
function messagePreviewText(message: Message): string | undefined {
  if (message.role === 'user') {
    const content = message.content as UserMessage['content'];
    if (typeof content === 'string') return content;
    return content
      .map((block) => block.text ?? '')
      .join('')
      .trim();
  }
  if (message.role === 'assistant' && message.content) {
    return message.content;
  }
  return undefined;
}

/**
 * 从文件所有行中倒序找出最后一条有文本的真实消息，清洗为预览文本。
 *
 * @param lines - 已按行拆分的 JSONL 文本
 * @returns 预览文本；无有效消息时为 undefined
 */
function lastMessagePreview(lines: string[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    let parsed: SessionLine;
    try {
      parsed = JSON.parse(raw) as SessionLine;
    } catch {
      continue;
    }
    if (parsed.type !== 'message') continue;
    const text = messagePreviewText(parsed.data as Message);
    if (text && text.trim()) {
      return buildPreviewText(text);
    }
  }
  return undefined;
}

export class SessionStore {
  private readonly sessionsDir: string;

  constructor(agentId: string) {
    this.sessionsDir = getAgentSessionsDir(agentId);
    this.ensureDirs();
  }

  /** Ensure required directories exist */
  private ensureDirs(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /** Get the sessions directory path */
  getSessionsPath(): string {
    return this.sessionsDir;
  }

  /** Resolve the JSONL file path for a given session ID */
  private sessionFilePath(id: string): string {
    return path.join(this.sessionsDir, `${id}.jsonl`);
  }

  /**
   * Create a new session file with the given metadata as the first line.
   * Overwrites any existing file at the same path.
   */
  createSessionFile(meta: SessionMeta): void {
    const line: SessionLine = {
      timestamp: new Date().toISOString(),
      type: 'session_meta',
      data: meta,
    };
    fs.writeFileSync(
      this.sessionFilePath(meta.id),
      JSON.stringify(line) + '\n'
    );
  }

  /**
   * Append a single message line to the end of a session file.
   * @returns `true` on success, `false` if the file does not exist
   */
  appendMessageLine(id: string, message: Message): boolean {
    const filePath = this.sessionFilePath(id);
    if (!fs.existsSync(filePath)) return false;
    const line: SessionLine = {
      timestamp: new Date().toISOString(),
      type: 'message',
      data: message,
    };
    fs.appendFileSync(filePath, JSON.stringify(line) + '\n');
    return true;
  }

  /**
   * Rewrite the first line (session_meta) of a session file.
   *
   * Reads the entire file, replaces the content before the first newline
   * with the new meta line, and preserves all subsequent message lines.
   * Only call this for infrequent metadata updates (title, model, etc.).
   */
  rewriteMetaLine(id: string, meta: SessionMeta): void {
    const filePath = this.sessionFilePath(id);
    const content = fs.readFileSync(filePath, 'utf8');
    const firstNewline = content.indexOf('\n');
    const rest = firstNewline === -1 ? '' : content.slice(firstNewline + 1);
    const line: SessionLine = {
      timestamp: new Date().toISOString(),
      type: 'session_meta',
      data: meta,
    };
    fs.writeFileSync(filePath, JSON.stringify(line) + '\n' + rest);
  }

  /**
   * Load a full session by ID.
   *
   * Reads the JSONL file line by line. The first line is parsed as
   * session_meta; subsequent lines are parsed as messages. Lines that
   * fail JSON parsing are silently skipped (crash recovery).
   * `updatedAt` is derived from the file's modification time.
   * `lastContextAt` / `lastMessageAt` are derived from the envelope
   * timestamps of the last context line and the last real message line.
   */
  loadSession(id: string): Session | null {
    const filePath = this.sessionFilePath(id);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    let meta: SessionMeta | null = null;
    const messages: Message[] = [];
    let lastContextAt: number | undefined;
    let lastMessageAt: number | undefined;

    for (const raw of lines) {
      let parsed: SessionLine;
      try {
        parsed = JSON.parse(raw) as SessionLine;
      } catch {
        continue;
      }
      if (parsed.type === 'session_meta' && !meta) {
        meta = parsed.data as SessionMeta;
      } else if (parsed.type === 'message') {
        const msg = parsed.data as Message;
        messages.push(msg);
        const ts = Date.parse(parsed.timestamp);
        if (Number.isNaN(ts)) continue;
        if (msg.role === 'context') {
          lastContextAt = ts;
        } else {
          lastMessageAt = ts;
        }
      }
    }

    if (!meta) return null;

    const stat = fs.statSync(filePath);
    // 文件名是会话 id 的权威来源。历史迁移可能留下 meta.id 与文件名不一致的残留，
    // 统一以传入的 id 为准，避免"列出时读到的 id"与"按 id 找文件"对不上。
    return {
      ...meta,
      id,
      updatedAt: stat.mtimeMs,
      lastContextAt,
      lastMessageAt,
      messages,
    };
  }

  /**
   * List all sessions' metadata by scanning the sessions directory.
   *
   * For each `.jsonl` file, parses the first line (session_meta) and derives
   * `updatedAt` from the file's modification time.
   * 常驻聊天会话额外从已读入的行中现算 lastMessage 预览；普通任务会话不算，
   * 预览目前只有聊天入口消费。JSON 解析失败的行静默跳过（崩溃恢复）。
   */
  listSessionFiles(): SessionMeta[] {
    if (!fs.existsSync(this.sessionsDir)) return [];

    const files = fs
      .readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith('.jsonl'));

    const results: SessionMeta[] = [];

    for (const file of files) {
      const filePath = path.join(this.sessionsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const firstLine = lines[0];
      if (!firstLine?.trim()) continue;

      let parsed: SessionLine;
      try {
        parsed = JSON.parse(firstLine) as SessionLine;
      } catch {
        continue;
      }
      if (parsed.type !== 'session_meta') continue;

      const meta = parsed.data as SessionMeta;
      const stat = fs.statSync(filePath);
      const id = file.replace(/\.jsonl$/, '');
      // 以文件名为 id 权威来源，meta.id 可能是历史残留。
      results.push({
        ...meta,
        id,
        updatedAt: stat.mtimeMs,
        ...(id.startsWith('chat') && {
          lastMessage: lastMessagePreview(lines),
        }),
      });
    }

    return results;
  }

  /** Delete a session file */
  deleteSessionFile(id: string): boolean {
    const filePath = this.sessionFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}
