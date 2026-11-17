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
import { getDb } from '../db/index.js';
import { Logger } from '../util/logger.js';

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

/** tools_invalidated 广播的防抖定时器 */
let invalidateTimer: ReturnType<typeof setTimeout> | null = null;

/** 防抖窗，注册与状态迁移的短时密集变化合成一次广播 */
const INVALIDATE_DEBOUNCE_MS = 300;

/** 防抖窗口内收集的归属 Agent，工具分配落盘时登记 */
const invalidatedAgentIds = new Set<string>();

/** 窗口内出现过注册表级变化则升级为全局广播 */
let registryChanged = false;

/**
 * 广播一次 tools_invalidated 事件。
 *
 * 工具分配落盘带 agentId 归属，防抖窗口内收集成数组随 data 发出，
 * 供消费端按 Agent 圈定刷新范围。注册表条目变化分不出归属，不带
 * 参数并把事件升级为全局，data 留空表示刷全部，归属与全局在同一
 * 窗口撞车时全局优先，宁多刷不漏刷。客户端不消费 data，整份重拉
 * 工具注册表的行为不变。定时器不阻塞进程退出。
 */
export function emitToolsInvalidated(scope?: { agentId: string }): void {
  if (scope) {
    invalidatedAgentIds.add(scope.agentId);
  } else {
    registryChanged = true;
  }
  if (invalidateTimer) return;
  invalidateTimer = setTimeout(() => {
    invalidateTimer = null;
    const agentIds = [...invalidatedAgentIds];
    invalidatedAgentIds.clear();
    const global = registryChanged;
    registryChanged = false;
    try {
      const event = insertChangeRow(
        getDb(),
        'tools_invalidated',
        null,
        global ? {} : { agentIds }
      );
      emitSessionChange(event);
    } catch (error) {
      Logger.log(
        'ERROR',
        `Failed to emit tools_invalidated: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, INVALIDATE_DEBOUNCE_MS);
  invalidateTimer.unref?.();
}
