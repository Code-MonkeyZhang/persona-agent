/**
 * @file src/renderer/lib/logger.ts
 * @description 渲染层日志工具，经 IPC 转发到主进程 electron-log 落盘
 * - Error 对象先序列化为字符串，IPC 结构化克隆会丢失 stack
 * - window.api 不存在时静默降级，测试与非 Electron 环境不报错
 */

type LogLevel = 'info' | 'warn' | 'error';

/** 将 Error 转为带 stack 的文本，其余类型原样返回 */
function serialize(arg: unknown): unknown {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`;
  }
  return arg;
}

function send(level: LogLevel, scope: string, args: unknown[]): void {
  window.api?.log(level, `[${scope}]`, ...args.map(serialize));
}

export const logger = {
  info: (scope: string, ...args: unknown[]): void => send('info', scope, args),
  warn: (scope: string, ...args: unknown[]): void => send('warn', scope, args),
  error: (scope: string, ...args: unknown[]): void =>
    send('error', scope, args),
};

/**
 * 挂载全局错误捕获，未处理异常与 Promise 拒绝送入日志
 * 在渲染层入口调用一次
 */
export function setupGlobalErrorLogging(): void {
  window.addEventListener('error', (event) => {
    logger.error('renderer', event.message, event.filename, event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.error('renderer', 'unhandled rejection', event.reason);
  });
}
