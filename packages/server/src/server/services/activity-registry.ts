/**
 * @fileoverview 运行中会话当前动作的内存登记表。
 *
 * chat-service 在步骤与工具事件上写入，websocket-server 组装 subscribed 时读取，
 * 独立模块保持两者单向依赖，registry 语义对齐 session-registry。
 * 仅进程内存不落盘，重启后由客户端的 runs_snapshot 与订阅链路自然收敛。
 */

import type { CurrentActivity } from '@persona/shared';

const activities = new Map<string, CurrentActivity>();

/**
 * 登记会话当前动作，同会话后写覆盖前写。
 * @param sessionId - 会话 ID
 * @param activity - 思考或工具执行的当前动作
 */
export function setActivity(
  sessionId: string,
  activity: CurrentActivity
): void {
  activities.set(sessionId, activity);
}

/**
 * 读会话当前动作，空闲或未登记返回 undefined。
 * @param sessionId - 会话 ID
 */
export function getActivity(sessionId: string): CurrentActivity | undefined {
  return activities.get(sessionId);
}

/**
 * 清除会话动作登记，回合结束路径统一调用。
 * @param sessionId - 会话 ID
 */
export function clearActivity(sessionId: string): void {
  activities.delete(sessionId);
}
