/**
 * @file shared/types/api.ts
 * @description 跨进程共享的 IPC 数据类型定义,主进程、预加载脚本、渲染层三方引用同一份类型
 */

/** 文件夹选择对话框配置 */
export interface SelectFolderOptions {
  title?: string;
  defaultPath?: string;
}

/** proxyFetch 请求参数 */
export interface ProxyFetchOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** proxyFetch 响应 */
export interface ProxyFetchResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
}

/** 更新状态推送给渲染层的联合类型 */
export type UpdateStatus =
  | { type: 'checking' }
  | { type: 'update-available'; version: string }
  | { type: 'update-not-available' }
  | { type: 'downloaded' }
  | { type: 'error'; message: string };

/** 下载进度推送给渲染层 */
export interface UpdateProgress {
  percent: number;
}

/**
 * 暴露给渲染进程的 window.api 接口
 * preload/index.ts 的实现和 renderer/types/window.d.ts 的声明共同引用此接口
 */
export interface WindowAPI {
  selectFolder: (options?: SelectFolderOptions) => Promise<string | null>;
  getServerUrl: () => Promise<string | null>;
  log: (level: string, ...args: unknown[]) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openPath: (filePath: string) => Promise<string>;
  proxyFetch: (
    url: string,
    options: ProxyFetchOptions
  ) => Promise<ProxyFetchResponse>;
  windowControls: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    unmaximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
  };
  updater: {
    getVersion: () => Promise<string>;
    checkForUpdates: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    installUpdate: () => Promise<void>;
    onStatusChange: (callback: (status: UpdateStatus) => void) => () => void;
    onDownloadProgress: (
      callback: (progress: UpdateProgress) => void
    ) => () => void;
  };
}
