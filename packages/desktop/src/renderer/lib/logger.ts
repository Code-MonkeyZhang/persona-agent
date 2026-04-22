/**
 * @file src/renderer/lib/logger.ts
 * @description 日志工具，通过 IPC 将渲染进程日志转发到主进程控制台输出
 */

/**
 * 日志对象，提供 info/error/warn/debug 四个级别的日志方法
 * 所有日志通过 window.api.log 发送到主进程统一输出
 */
export const logger = {
  info: (...args: unknown[]): Promise<void> =>
    window.api?.log?.('info', ...args) ?? Promise.resolve(),
  error: (...args: unknown[]): Promise<void> =>
    window.api?.log?.('error', ...args) ?? Promise.resolve(),
  warn: (...args: unknown[]): Promise<void> =>
    window.api?.log?.('warn', ...args) ?? Promise.resolve(),
  debug: (...args: unknown[]): Promise<void> =>
    window.api?.log?.('debug', ...args) ?? Promise.resolve(),
};
