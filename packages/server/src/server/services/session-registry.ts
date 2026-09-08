/**
 * @fileoverview 运行中会话的 AbortController 注册表。
 *
 * 模块级单例。ChatService 注册 controller，WebSocket 服务
 * 收到客户端 abort 消息时查表触发。
 */

const controllers = new Map<string, AbortController>();

/** 注册一个正在运行的会话及其控制器 */
export function register(sessionId: string, controller: AbortController): void {
  controllers.set(sessionId, controller);
}

/** 注销会话（生成结束、出错或被取消后调用） */
export function unregister(sessionId: string): void {
  controllers.delete(sessionId);
}

/** 查询会话是否正在运行（用于重入保护） */
export function has(sessionId: string): boolean {
  return controllers.has(sessionId);
}

/**
 * 触发会话的 abort。
 * @returns 命中并触发返回 true，会话不在运行返回 false
 */
export function abort(sessionId: string): boolean {
  const controller = controllers.get(sessionId);
  if (!controller) return false;
  controller.abort();
  return true;
}
