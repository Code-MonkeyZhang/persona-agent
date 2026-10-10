/**
 * @fileoverview Session storage operations backed by SQLite.
 *
 * 会话与消息落在唯一正本库的 sessions 与 messages 两张表。
 * 消息顺序由全局递增的 seq 主键承载，turn_end 边界存 sessions 的
 * turn_ends JSON 列。每次写操作在同一事务里登记 changes 变更行，
 * 提交成功后经 changes.ts 分发给订阅方。
 */

import { getDb } from '../db/index.js';
import { buildPreviewText, messagePreviewText } from '@persona/shared';
import type { SessionChange } from '@persona/shared';
import { Logger } from '../util/logger.js';
import type { SQLQueryBindings, Statement } from 'bun:sqlite';
import { emitSessionChange, insertChangeRow } from './changes.js';
import type { Session, SessionMeta } from './types.js';
import type { ModelConfig } from '../agent/types.js';
import type { Message } from '../schema/index.js';

/** sessions 表一行。 */
export interface SessionRow {
  id: string;
  agent_id: string;
  title: string;
  workspace_path: string | null;
  model: string | null;
  summarized_up_to: number | null;
  current_pose: string | null;
  turn_ends: string | null;
  last_message_preview: string | null;
  created_at: number;
  updated_at: number;
}

/** messages 表一行。 */
interface MessageRow {
  seq: number;
  session_id: string;
  role: string;
  created_at: number;
  data: string;
}

/**
 * sessions 行转 SessionMeta，loadSession 与 listSessionFiles 共用，
 * 快照构建也经此处取同一形状。
 */
export function rowToMeta(row: SessionRow): SessionMeta {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspacePath: row.workspace_path ?? undefined,
    // model 列可空，updateModel 写入的 undefined 落库为 NULL，这里还原
    model: (row.model === null
      ? undefined
      : JSON.parse(row.model)) as ModelConfig,
    summarizedUpTo: row.summarized_up_to ?? undefined,
    currentPose: row.current_pose ?? undefined,
  };
}

/**
 * 取按返回行类型缓存的语句，参数接受任意个绑定值。
 */
function statement<T>(sql: string): Statement<T, SQLQueryBindings[]> {
  return getDb().query<T, SQLQueryBindings[]>(sql);
}

/**
 * 构造 session_updated 事件的载荷。
 * 形状与 loadSession 读出的 Session 去掉 messages 后一致，
 * 两个派生时间戳经聚合查询现算。
 */
function buildSessionPayload(row: SessionRow, id: string) {
  const stamps = statement<{
    last_context_at: number | null;
    last_message_at: number | null;
  }>(
    `SELECT MAX(CASE WHEN role = 'context' THEN created_at END) AS last_context_at,
            MAX(CASE WHEN role != 'context' THEN created_at END) AS last_message_at
     FROM messages WHERE session_id = ?`
  ).get(id);
  return {
    ...rowToMeta(row),
    lastContextAt: stamps?.last_context_at ?? undefined,
    lastMessageAt: stamps?.last_message_at ?? undefined,
    turnEnds: row.turn_ends
      ? (JSON.parse(row.turn_ends) as number[])
      : undefined,
  };
}

export class SessionStore {
  constructor(private readonly agentId: string) {}

  /**
   * Create a new session row with the given metadata.
   * turn_ends 与 last_message_preview 初始为 NULL，
   * 同事务登记 session_created 事件。
   */
  createSessionFile(meta: SessionMeta): void {
    const db = getDb();
    const event = db.transaction(() => {
      db.query(
        `INSERT INTO sessions
          (id, agent_id, title, workspace_path, model, summarized_up_to,
           current_pose, turn_ends, last_message_preview, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`
      ).run(
        meta.id,
        meta.agentId,
        meta.title,
        meta.workspacePath ?? null,
        JSON.stringify(meta.model) ?? null,
        meta.summarizedUpTo ?? null,
        meta.currentPose ?? null,
        meta.createdAt,
        meta.updatedAt
      );
      return insertChangeRow(db, 'session_created', meta.id, meta);
    })();
    emitSessionChange(event);
  }

  /**
   * Append a single message row and bump the session row.
   * 追加带文本的 user 或 assistant 消息时顺手维护预览列，
   * 同事务登记携带完整消息体的 message_appended 事件。
   * @returns `true` on success, `false` if the session does not exist
   */
  appendMessageLine(id: string, message: Message): boolean {
    const db = getDb();
    try {
      const event = db.transaction((): SessionChange | null => {
        const exists = db
          .query('SELECT 1 FROM sessions WHERE id = ? AND agent_id = ?')
          .get(id, this.agentId);
        if (!exists) return null;

        const now = Date.now();
        const insert = db
          .query(
            'INSERT INTO messages (session_id, role, created_at, data) VALUES (?, ?, ?, ?)'
          )
          .run(id, message.role, now, JSON.stringify(message));

        const text = messagePreviewText(message);
        if (text && text.trim()) {
          db.query(
            'UPDATE sessions SET updated_at = ?, last_message_preview = ? WHERE id = ?'
          ).run(now, buildPreviewText(text), id);
        } else {
          db.query('UPDATE sessions SET updated_at = ? WHERE id = ?').run(
            now,
            id
          );
        }
        return insertChangeRow(db, 'message_appended', id, {
          seq: Number(insert.lastInsertRowid),
          message,
          createdAt: now,
        });
      })();
      if (event) emitSessionChange(event);
      return event !== null;
    } catch (error) {
      // 落库失败打日志留痕，返回 false 保持布尔契约
      Logger.log('SESSION', `Failed to append message to session ${id}`, error);
      return false;
    }
  }

  /**
   * Append a turn end boundary to the session row.
   * turn_ends 列记录各边界之前的消息数，重复下标表达空缓冲轮次，
   * 同事务登记携带完整快照的 turn_end 事件。
   * @returns `true` on success, `false` if the session does not exist
   */
  appendTurnEndLine(id: string): boolean {
    const db = getDb();
    try {
      const event = db.transaction((): SessionChange | null => {
        const row = statement<Pick<SessionRow, 'turn_ends'>>(
          'SELECT turn_ends FROM sessions WHERE id = ? AND agent_id = ?'
        ).get(id, this.agentId);
        if (!row) return null;

        const count = statement<{ n: number }>(
          'SELECT COUNT(*) AS n FROM messages WHERE session_id = ?'
        ).get(id);
        const turnEnds: number[] = row.turn_ends
          ? (JSON.parse(row.turn_ends) as number[])
          : [];
        turnEnds.push(count?.n ?? 0);
        db.query(
          'UPDATE sessions SET turn_ends = ?, updated_at = ? WHERE id = ?'
        ).run(JSON.stringify(turnEnds), Date.now(), id);
        return insertChangeRow(db, 'turn_end', id, { turnEnds });
      })();
      if (event) emitSessionChange(event);
      return event !== null;
    } catch (error) {
      Logger.log(
        'SESSION',
        `Failed to append turn end to session ${id}`,
        error
      );
      return false;
    }
  }

  /**
   * Update all metadata columns of the session row.
   * 调用方先经 loadSession 确认会话存在，行不存在时静默无操作，
   * 更新成功登记携带完整元信息的 session_updated 事件。
   */
  rewriteMetaLine(id: string, meta: SessionMeta): void {
    const db = getDb();
    const event = db.transaction((): SessionChange | null => {
      db.query(
        `UPDATE sessions SET title = ?, workspace_path = ?, model = ?,
          summarized_up_to = ?, current_pose = ?, updated_at = ?
         WHERE id = ? AND agent_id = ?`
      ).run(
        meta.title,
        meta.workspacePath ?? null,
        JSON.stringify(meta.model) ?? null,
        meta.summarizedUpTo ?? null,
        meta.currentPose ?? null,
        meta.updatedAt,
        id,
        this.agentId
      );
      const row = statement<SessionRow>(
        'SELECT * FROM sessions WHERE id = ? AND agent_id = ?'
      ).get(id, this.agentId);
      if (!row) return null;
      return insertChangeRow(
        db,
        'session_updated',
        id,
        buildSessionPayload(row, id)
      );
    })();
    if (event) emitSessionChange(event);
  }

  /**
   * Load a full session by ID.
   *
   * 查 sessions 一行加 messages 按 seq 排序的行集。lastContextAt 与
   * lastMessageAt 在遍历消息行时从 created_at 列现算，updatedAt 取列值，
   * turnEnds 解析 turn_ends JSON 列。
   */
  loadSession(id: string): Session | null {
    const row = statement<SessionRow>(
      'SELECT * FROM sessions WHERE id = ? AND agent_id = ?'
    ).get(id, this.agentId);
    if (!row) return null;

    const messageRows = statement<MessageRow>(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY seq'
    ).all(id);

    const messages: Message[] = [];
    let lastContextAt: number | undefined;
    let lastMessageAt: number | undefined;
    for (const messageRow of messageRows) {
      const message = JSON.parse(messageRow.data) as Message;
      // 行号挂到消息上，HTTP 详情与缓存路径共用稳定去重键
      message.seq = messageRow.seq;
      messages.push(message);
      if (messageRow.role === 'context') {
        lastContextAt = messageRow.created_at;
      } else {
        lastMessageAt = messageRow.created_at;
      }
    }

    return {
      ...rowToMeta(row),
      lastContextAt,
      lastMessageAt,
      turnEnds: row.turn_ends
        ? (JSON.parse(row.turn_ends) as number[])
        : undefined,
      messages,
    };
  }

  /**
   * List all sessions' metadata for this agent.
   *
   * chat 前缀会话附上追加时维护的预览列作 lastMessage；普通任务会话
   * 不暴露预览。排序由 SessionManager 做。
   */
  listSessionFiles(): SessionMeta[] {
    const rows = statement<SessionRow>(
      'SELECT * FROM sessions WHERE agent_id = ?'
    ).all(this.agentId);

    return rows.map((row) => {
      const meta = rowToMeta(row);
      if (row.id.startsWith('chat')) {
        meta.lastMessage = row.last_message_preview ?? undefined;
      }
      return meta;
    });
  }

  /**
   * Delete a session row and its messages.
   * 先删 messages 再删 sessions，外键级联双保险，
   * 同事务登记 session_deleted 事件。
   * @returns `true` if the session existed, `false` otherwise
   */
  deleteSessionFile(id: string): boolean {
    const db = getDb();
    const event = db.transaction((): SessionChange | null => {
      db.query('DELETE FROM messages WHERE session_id = ?').run(id);
      const result = db
        .query('DELETE FROM sessions WHERE id = ? AND agent_id = ?')
        .run(id, this.agentId);
      if (result.changes === 0) return null;
      return insertChangeRow(db, 'session_deleted', id, {});
    })();
    if (event) emitSessionChange(event);
    return event !== null;
  }
}
