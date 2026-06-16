/**
 * @fileoverview Error message extraction utility.
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
