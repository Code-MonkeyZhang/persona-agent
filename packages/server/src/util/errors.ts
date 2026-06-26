/**
 * @fileoverview Error utilities — AppError class and message extraction.
 */

/**
 * 从捕获的 unknown 类型错误中提取可读消息。
 *
 * catch 块中的 error 类型为 unknown，不能直接访问 .message。
 * 此函数统一处理类型判断，返回可展示给用户或记录日志的字符串。
 *
 * @param err - catch 块中的 unknown 类型错误
 * @returns Error 对象返回其 message 属性，其他类型返回 String() 转换结果
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 应用层业务错误，携带 HTTP 状态码。
 *
 * 在路由处理函数中直接 `throw new AppError(404, 'Agent not found')`，
 * 由 asyncHandler 或全局错误中间件统一捕获并转成 `{ error: message }` 响应。
 * 业务错误（4xx）默认不记录日志；服务端错误（5xx）会记录。
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
