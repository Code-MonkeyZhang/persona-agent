/**
 * @file preload 脚本 - 主进程与渲染进程之间的安全桥接层
 *
 * preload 运行在有 Node.js 权限的特殊环境中，
 * 通过 contextBridge 将以下操作暴露到 window.api：
 * - 系统文件夹选择器
 * - 后端服务地址查询
 * - 日志代理写入
 * - 窗口控制
 * - 网络代理请求
 */
import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { IPC } from '@shared/ipc/channels';
import type { WindowAPI } from '@shared/types/api';

/**
 * 暴露给渲染进程的 API 集合，前端通过 window.api.xxx() 调用
 * 每个方法底层通过 ipcRenderer.invoke 向主进程发送 IPC 消息
 */
const api: WindowAPI = {
  /**
   * 弹出系统原生的文件夹选择对话框
   * @param options - 对话框配置，可指定标题和默认打开路径
   * @returns 用户选中的文件夹路径，取消则返回 null
   */
  selectFolder: (options) => ipcRenderer.invoke(IPC.SELECT_FOLDER, options),

  /**
   * Get the backend Agent Server URL.
   * The backend starts dynamically, so the renderer queries the main process for the address.
   * @returns 服务地址，未启动则返回 null
   */
  getServerUrl: () => ipcRenderer.invoke(IPC.GET_SERVER_URL),

  /**
   * 让前端通过主进程写入日志 的传递
   * @param level - 日志级别
   * @param args - 日志内容
   */
  log: (level, ...args) => ipcRenderer.invoke(IPC.LOG, level, ...args),

  /**
   * 通过主进程代理发起 HTTP 请求，绕过渲染进程的 CORS 限制
   * @param url - 请求目标 URL
   * @param options - 请求参数
   * @returns 响应对象，包含状态码、响应头和 body
   */
  proxyFetch: (url, options) =>
    ipcRenderer.invoke(IPC.PROXY_FETCH, url, options),

  /**
   * 使用系统默认浏览器打开指定 URL
   * @param url - 要打开的 URL
   */
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),

  openPath: (filePath) => ipcRenderer.invoke(IPC.OPEN_PATH, filePath),

  /** 窗口控制方法集合，每个方法通过 IPC 转发到主进程执行。 */
  windowControls: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    unmaximize: () => ipcRenderer.invoke(IPC.WINDOW_UNMAXIMIZE),
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
    isMaximized: () =>
      ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED) as Promise<boolean>,

    /**
     * 监听窗口最大化事件
     * @param callback - 状态变化时的回调函数，接收最新的最大化状态
     * @returns 取消监听的函数，调用后移除监听器 避免内存泄漏
     */
    onMaximizedChange: (callback) => {
      const listener = (_: Electron.IpcRendererEvent, isMaximized: boolean) =>
        callback(isMaximized);
      ipcRenderer.on(IPC.WINDOW_MAXIMIZED_CHANGED, listener);
      return () =>
        ipcRenderer.removeListener(IPC.WINDOW_MAXIMIZED_CHANGED, listener);
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
