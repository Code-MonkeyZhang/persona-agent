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
import type { Session, SessionMeta } from './types.js';
import type { Message } from '../schema/index.js';

/** Internal shape of one JSONL line */
interface SessionLine {
  timestamp: string;
  type: 'session_meta' | 'message';
  data: unknown;
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
   */
  loadSession(id: string): Session | null {
    const filePath = this.sessionFilePath(id);
    if (!fs.existsSync(filePath)) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());

    let meta: SessionMeta | null = null;
    const messages: Message[] = [];

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
        messages.push(parsed.data as Message);
      }
    }

    if (!meta) return null;

    const stat = fs.statSync(filePath);
    // 文件名是会话 id 的权威来源。历史迁移可能留下 meta.id 与文件名不一致的残留，
    // 统一以传入的 id（即文件名）为准，避免"列出时读到的 id"与"按 id 找文件"对不上。
    return { ...meta, id, updatedAt: stat.mtimeMs, messages };
  }

  /**
   * List all sessions' metadata by scanning the sessions directory.
   *
   * For each `.jsonl` file, reads only the first line to extract the
   * session_meta. `updatedAt` is derived from the file's modification time.
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
      const firstLine = content.split('\n')[0];
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
      // 以文件名为 id 权威来源（见 loadSession 同名注释），meta.id 可能是历史残留。
      results.push({
        ...meta,
        id: file.replace(/\.jsonl$/, ''),
        updatedAt: stat.mtimeMs,
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
