/**
 * @fileoverview 会话待注入缓冲。
 *
 * 生成中的会话收到用户插话或 App 通知时进入内存缓冲，
 * Agent 步骤间隙由 chat-service 通过 takePendingInputs 回调取空注入。
 * 内存态不持久化，服务重启即清空。
 */

import type { PendingInput } from '@persona/shared';
import { broadcastToSession } from '../websocket-server.js';
import { Logger } from '../../util/logger.js';

const buffers = new Map<string, PendingInput[]>();

/**
 * 写入一条待注入消息并广播全量缓冲列表。
 *
 * @param sessionId - 目标会话
 * @param input - 缓冲条目内容，id 由本函数生成
 * @returns 写入的完整缓冲条目
 */
export function addPendingInput(
  sessionId: string,
  input: Omit<PendingInput, 'id'>
): PendingInput {
  const entry: PendingInput = { ...input, id: crypto.randomUUID() };
  const list = buffers.get(sessionId) ?? [];
  list.push(entry);
  buffers.set(sessionId, list);
  broadcastToSession(sessionId, {
    type: 'pending_input_changed',
    sessionId,
    pending: list,
  });
  Logger.log('PENDING', 'Input buffered', {
    sessionId,
    source: entry.source,
    pendingId: entry.id,
    pendingCount: list.length,
  });
  return entry;
}

/**
 * 查询会话缓冲是否还有待注入消息，只查不取。
 *
 * 供回合收尾判断是否续跑消费插话。
 *
 * @param sessionId - 目标会话
 * @returns 缓冲非空返回 true
 */
export function hasPendingInputs(sessionId: string): boolean {
  const list = buffers.get(sessionId);
  return !!list && list.length > 0;
}

/**
 * 取空会话的待注入缓冲并广播空列表。
 *
 * 空缓冲静默返回空数组，避免 runStream 每步调用产生广播噪音。
 *
 * @param sessionId - 目标会话
 * @returns 取出的缓冲条目，可能为空
 */
export function drainPendingInputs(sessionId: string): PendingInput[] {
  const list = buffers.get(sessionId);
  if (!list || list.length === 0) return [];
  buffers.delete(sessionId);
  broadcastToSession(sessionId, {
    type: 'pending_input_changed',
    sessionId,
    pending: [],
  });
  Logger.log('PENDING', 'Buffer drained for injection', {
    sessionId,
    count: list.length,
  });
  return list;
}
