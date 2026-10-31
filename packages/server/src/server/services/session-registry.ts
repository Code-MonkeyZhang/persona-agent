/**
 * @fileoverview 运行中会话的 AbortController 注册表。
 *
 * 模块级单例。ChatService 注册 controller 与归属 Agent，WebSocket 服务
 * 收到客户端 abort 消息时查表触发，连接建立时经 list 取
 * 运行全量列表推送快照。
 */

interface RunningEntry {
  agentId: string;
  controller: AbortController;
}

const controllers = new Map<string, RunningEntry>();

/** 注册一个正在运行的会话，携带归属 Agent 与控制器 */
export function register(
  sessionId: string,
  agentId: string,
  controller: AbortController
): void {
  controllers.set(sessionId, { agentId, controller });
}

/** 注销会话（生成结束、出错或被取消后调用） */
export function unregister(sessionId: string): void {
  controllers.delete(sessionId);
}

/** 查询会话是否正在运行（用于重入保护） */
export function has(sessionId: string): boolean {
  return controllers.has(sessionId);
}

/** 运行全量的带归属条目，连接快照的数据源 */
export function list(): Array<{ sessionId: string; agentId: string }> {
  return [...controllers.entries()].map(([sessionId, entry]) => ({
    sessionId,
    agentId: entry.agentId,
  }));
}

/**
 * 触发会话的 abort。
 * @returns 命中并触发返回 true，会话不在运行返回 false
 */
export function abort(sessionId: string): boolean {
  const entry = controllers.get(sessionId);
  if (!entry) return false;
  entry.controller.abort();
  return true;
}
