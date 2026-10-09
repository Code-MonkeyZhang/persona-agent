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
import { IPC } from '@shared/channels';
import type {
  WindowAPI,
  UpdateStatus,
  UpdateProgress,
  ConnectionSnapshot,
} from '@shared/api';
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
   * 查询主进程持有的连接事实。
   * current 是当前连接，local 是本机常驻连接，渲染层只认这里不感知进程。
   * @returns 连接事实快照
   */
  getConnection: () => ipcRenderer.invoke(IPC.GET_CONNECTION),

  /**
   * 查询设备清单，主进程 devices.json 的只读镜像。
   * @returns 设备条目数组，本机置顶
   */
  getDevices: () => ipcRenderer.invoke(IPC.GET_DEVICES),

  /**
   * 条目落位，识别为旧主机时更新地址与自称名，新主机建条目。
   * @param entry - 握手识别出的主机身份与地址
   */
  upsertDevice: (entry: {
    hostId: string;
    hostName: string;
    address: string;
  }) => ipcRenderer.invoke(IPC.DEVICE_UPSERT, entry),

  /**
   * 设备改名，只影响本机显示，不下发。
   */
  renameDevice: (hostId: string, name: string) =>
    ipcRenderer.invoke(IPC.DEVICE_RENAME, hostId, name),

  /**
   * 删除设备条目并释放该主机的本地镜像，本机不可删。
   * @returns 删除是否成功
   */
  removeDevice: (hostId: string) =>
    ipcRenderer.invoke(IPC.DEVICE_REMOVE, hostId),

  /**
   * 发起主机切换，主进程内串行原子执行。
   * @param target - 目标主机标识与地址，本机传 local
   */
  switchHost: (target: { hostId: string; address: string | null }) =>
    ipcRenderer.invoke(IPC.SWITCH_HOST, target),

  /**
   * 订阅连接变更推送，切换完成时触发。
   * @returns 退订函数
   */
  onConnectionChanged: (callback: (snapshot: ConnectionSnapshot) => void) => {
    const listener = (
      _e: Electron.IpcRendererEvent,
      snapshot: ConnectionSnapshot
    ): void => callback(snapshot);
    ipcRenderer.on(IPC.CONNECTION_CHANGED, listener);
    return () => {
      ipcRenderer.removeListener(IPC.CONNECTION_CHANGED, listener);
    };
  },

  /**
   * 让前端通过主进程写入日志 的传递
   * @param level - 日志级别
   * @param args - 日志内容
   */
  log: (level, ...args) => ipcRenderer.invoke(IPC.LOG, level, ...args),

  /**
   * 运行时切换主进程文件日志开关
   * @param enabled - 是否写入日志文件
   */
  setLoggingEnabled: (enabled) =>
    ipcRenderer.invoke(IPC.SET_LOGGING_ENABLED, enabled),

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

  /** 更新检查相关方法，通过 IPC 转发到主进程的 electron-updater */
  updater: {
    getVersion: () => ipcRenderer.invoke(IPC.UPDATER_GET_VERSION),
    checkForUpdates: () => ipcRenderer.invoke(IPC.UPDATER_CHECK_FOR_UPDATES),
    downloadUpdate: () => ipcRenderer.invoke(IPC.UPDATER_DOWNLOAD_UPDATE),
    installUpdate: () => ipcRenderer.invoke(IPC.UPDATER_INSTALL_UPDATE),

    /**
     * 监听更新状态变化
     * @param callback - 状态变化回调
     * @returns 取消监听函数
     */
    onStatusChange: (callback) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        status: UpdateStatus
      ): void => {
        callback(status);
      };
      ipcRenderer.on(IPC.UPDATER_STATUS_CHANGED, listener);
      return () =>
        ipcRenderer.removeListener(IPC.UPDATER_STATUS_CHANGED, listener);
    },

    /**
     * 监听下载进度
     * @param callback - 进度回调
     * @returns 取消监听函数
     */
    onDownloadProgress: (callback) => {
      const listener = (
        _: Electron.IpcRendererEvent,
        progress: UpdateProgress
      ): void => {
        callback(progress);
      };
      ipcRenderer.on(IPC.UPDATER_DOWNLOAD_PROGRESS, listener);
      return () =>
        ipcRenderer.removeListener(IPC.UPDATER_DOWNLOAD_PROGRESS, listener);
    },
  },

  /** 本地缓存读写与更新订阅，全部经主进程 cache 模块执行 */
  cache: {
    getSessions: (agentId) =>
      ipcRenderer.invoke(IPC.CACHE_GET_SESSIONS, agentId),
    getSession: (sessionId) =>
      ipcRenderer.invoke(IPC.CACHE_GET_SESSION, sessionId),
    getAgents: () => ipcRenderer.invoke(IPC.CACHE_GET_AGENTS),
    getCursor: () => ipcRenderer.invoke(IPC.CACHE_GET_CURSOR),
    applySnapshot: (snapshot) =>
      ipcRenderer.invoke(IPC.CACHE_APPLY_SNAPSHOT, snapshot),
    applyChanges: (changes) =>
      ipcRenderer.invoke(IPC.CACHE_APPLY_CHANGES, changes),
    putAgents: (agents) => ipcRenderer.invoke(IPC.CACHE_PUT_AGENTS, agents),
    deleteAgent: (agentId) =>
      ipcRenderer.invoke(IPC.CACHE_DELETE_AGENT, agentId),
    reset: () => ipcRenderer.invoke(IPC.CACHE_RESET),

    /**
     * 监听缓存写后的更新通知
     * @param callback - 缓存变化时的回调
     * @returns 取消监听函数
     */
    onChanged: (callback) => {
      const listener = (): void => callback();
      ipcRenderer.on(IPC.CACHE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.CACHE_CHANGED, listener);
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
