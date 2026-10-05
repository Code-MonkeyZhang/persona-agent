/**
 * @fileoverview 全量同步快照构建。
 *
 * 冷启动客户端一次拉走服务端全部会话与消息。
 * 先取 changes 表最新序号再直读业务表，此后发生的变更序号必然更大，
 * 客户端以快照序号为起点追平变更流，重叠部分靠消息行号去重。
 */

import { getDb } from '../db/index.js';
import { rowToMeta, type SessionRow } from '../session/store.js';
import type {
  Message,
  SnapshotMessage,
  SnapshotSession,
  SyncSnapshot,
} from '@persona/shared';
import type { SQLQueryBindings } from 'bun:sqlite';

/** messages 表一行，快照直读用。 */
interface MessageRow {
  seq: number;
  session_id: string;
  role: string;
  created_at: number;
  data: string;
}

/** 构建全量快照，latestSeq 之后的新变化由客户端经变更流补齐。 */
export function buildSnapshot(): SyncSnapshot {
  const db = getDb();

  const headRow = db
    .query<
      { max: number | null },
      SQLQueryBindings[]
    >('SELECT MAX(seq) AS max FROM changes')
    .get();
  const latestSeq = headRow?.max ?? 0;

  const sessionRows = db
    .query<
      SessionRow,
      SQLQueryBindings[]
    >('SELECT * FROM sessions ORDER BY updated_at DESC')
    .all();
  const messageRows = db
    .query<
      MessageRow,
      SQLQueryBindings[]
    >('SELECT * FROM messages ORDER BY seq')
    .all();

  /** 按会话归组消息，行号挂到消息上与详情路径同形 */
  const bySession = new Map<string, SnapshotMessage[]>();
  for (const row of messageRows) {
    const message = JSON.parse(row.data) as Message;
    message.seq = row.seq;
    const group = bySession.get(row.session_id);
    if (group) {
      group.push({ seq: row.seq, message, createdAt: row.created_at });
    } else {
      bySession.set(row.session_id, [
        { seq: row.seq, message, createdAt: row.created_at },
      ]);
    }
  }

  const sessions: SnapshotSession[] = sessionRows.map((row) => ({
    ...rowToMeta(row),
    turnEnds: row.turn_ends
      ? (JSON.parse(row.turn_ends) as number[])
      : undefined,
    messages: bySession.get(row.id) ?? [],
  }));

  return { latestSeq, sessions };
}
