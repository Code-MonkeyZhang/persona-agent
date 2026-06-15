/**
 * @file shared/ipc/channels.ts
 * @description IPC 通道名常量,主进程和预加载脚本共同引用,避免裸字符串拼写错误
 */

export const IPC = {
  GET_SERVER_URL: 'get-server-url',
  SELECT_FOLDER: 'select-folder',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_UNMAXIMIZE: 'window:unmaximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED_CHANGED: 'window:maximized-changed',
  LOG: 'log',
  PROXY_FETCH: 'proxy-fetch',
  OPEN_EXTERNAL: 'open-external',
  OPEN_PATH: 'open-path',
} as const;
