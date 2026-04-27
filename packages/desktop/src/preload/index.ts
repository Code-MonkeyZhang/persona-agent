/**
 * @file preload 脚本 - 主进程与渲染进程之间的安全桥接层
 *
 * preload 运行在有 Node.js 权限的特殊环境中，
 * 通过 contextBridge 将以下操作暴露到 window.api：
 * - 打开设置窗口
 * - 系统文件夹选择器
 * - 后端服务地址查询
 * - 日志代理写入
 * - 窗口控制（最小化/最大化/关闭/状态监听）
 * - 网络代理请求（绕过 CORS 限制）
 */
import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

/**
 * 暴露给渲染进程的 API 集合，前端通过 window.api.xxx() 调用
 * 每个方法底层通过 ipcRenderer.invoke 向主进程发送 IPC 消息
 */
const api = {
  /**
   * 打开设置窗口，通过 IPC 通知主进程。
   */
  openSettingsWindow: () => ipcRenderer.invoke('open-settings-window'),

  /**
   * 弹出系统原生的文件夹选择对话框
   * @param options - 对话框配置，可指定标题和默认打开路径
   * @returns 用户选中的文件夹路径，取消则返回 null
   */
  selectFolder: (options?: {
    title?: string;
    defaultPath?: string;
  }): Promise<string | null> => ipcRenderer.invoke('select-folder', options),

  /**
   * Get the backend Agent Server URL.
   * The backend starts dynamically, so the renderer queries the main process for the address.
   * @returns 服务地址，未启动则返回 null
   */
  getServerUrl: (): Promise<string | null> =>
    ipcRenderer.invoke('get-server-url'),

  /**
   * 让前端通过主进程写入日志 的传递
   * @param level - 日志级别（info/warn/error 等）
   * @param args - 日志内容
   */
  log: (level: string, ...args: unknown[]): Promise<void> =>
    ipcRenderer.invoke('log', level, ...args),

  /**
   * 通过主进程代理发起 HTTP 请求，绕过渲染进程的 CORS 限制
   * @param url - 请求目标 URL
   * @param options - 请求参数（方法、请求头、请求体）
   * @returns 响应对象，包含状态码、响应头和 body（ArrayBuffer）
   */
  proxyFetch: (
    url: string,
    options: {
      method: string;
      headers: Record<string, string>;
      body?: string;
    }
  ): Promise<{
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    body: ArrayBuffer;
  }> => ipcRenderer.invoke('proxy-fetch', url, options),

  /** 窗口控制方法集合，每个方法通过 IPC 转发到主进程执行。 */
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    unmaximize: () => ipcRenderer.invoke('window:unmaximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () =>
      ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,

    /**
     * 监听窗口最大化事件
     * @param callback - 状态变化时的回调函数，接收最新的最大化状态
     * @returns 取消监听的函数，调用后移除监听器 避免内存泄漏
     */
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      const listener = (_: Electron.IpcRendererEvent, isMaximized: boolean) =>
        callback(isMaximized);
      ipcRenderer.on('window:maximized-changed', listener);
      return () =>
        ipcRenderer.removeListener('window:maximized-changed', listener);
    },
  },
};

/**
 * 通过 contextBridge 将 API 挂载到渲染进程的全局对象上
 * - window.electron: Electron 官方工具 API
 * - window.api: 上面定义的自定义业务 API
 */
try {
  contextBridge.exposeInMainWorld('electron', electronAPI);
  contextBridge.exposeInMainWorld('api', api);
} catch (error) {
  console.error(error);
}
