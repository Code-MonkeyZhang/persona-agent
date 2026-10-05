/**
 * @fileoverview 会话变更事件的进程内分发。
 *
 * store 在事务提交成功后把新产生的变更事件发到这里，
 * websocket-server 订阅后广播给全部在线客户端。
 * store 与 websocket-server 经此模块解耦，互不直接依赖。
 */

import { EventEmitter } from 'node:events';
import type { SessionChange } from '@persona/shared';

/** 变更事件分发器，进程内单例。 */
export const sessionChangeEmitter = new EventEmitter();

/** 事务提交成功后调用，把变更事件分发给订阅方。 */
export function emitSessionChange(change: SessionChange): void {
  sessionChangeEmitter.emit('change', change);
}
