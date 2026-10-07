/**
 * @fileoverview 变更事件的登记与进程内分发。
 *
 * insertChangeRow 在写事务内登记事件行，回滚时随业务写一起消失，
 * emitSessionChange 在提交成功后把事件分发给订阅方，
 * websocket-server 订阅后广播给全部在线客户端。
 * 会话 store 与 agent 配置 store 共用这条通路，互不直接依赖。
 */

import { EventEmitter } from 'node:events';
import type { Database } from 'bun:sqlite';
import type { ChangeKind, SessionChange } from '@persona/shared';

/** 变更事件分发器，进程内单例。 */
export const sessionChangeEmitter = new EventEmitter();

/** 事务提交成功后调用，把变更事件分发给订阅方。 */
export function emitSessionChange(change: SessionChange): void {
  sessionChangeEmitter.emit('change', change);
}

/**
 * 在当前事务里登记一条变更事件并返回事件对象。
 * 事务回滚时事件行随业务写一起消失，不会发出有号无数据的事件。
 */
export function insertChangeRow(
  db: Database,
  kind: ChangeKind,
  sessionId: string | null,
  data: unknown
): SessionChange {
  const createdAt = Date.now();
  const result = db
    .query(
      'INSERT INTO changes (kind, session_id, data, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(kind, sessionId, JSON.stringify(data), createdAt);
  return {
    seq: Number(result.lastInsertRowid),
    kind,
    sessionId,
    data,
    createdAt,
  };
}
