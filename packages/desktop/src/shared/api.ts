/**
 * @file shared/api.ts
 * @description 跨进程共享的 IPC 数据类型定义,主进程、预加载脚本、渲染层三方引用同一份类型
 */

import type {
  AgentConfig,
  Session,
  SessionChange,
  SessionMeta,
  SyncSnapshot,
} from '@persona/shared';

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
interface ProxyFetchResponse {
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

/** 单条主机连接事实，address 为 null 表示尚未就绪 */
export interface HostConnection {
  hostId: string;
  address: string | null;
  status: 'connecting' | 'connected' | 'disconnected';
}

/** 连接事实快照，current 是当前连接，local 是本机常驻连接 */
export interface ConnectionSnapshot {
  current: HostConnection;
  local: HostConnection;
}

/** switchHost 失败的机器可读错误码 */
export type SwitchErrorCode =
  | 'unreachable'
  | 'handshake_failed'
  | 'identity_mismatch';

/** switchHost 的结果 */
export type SwitchResult = { ok: true } | { ok: false; error: SwitchErrorCode };

/** 设备清单里的本机固定标识 */
export const LOCAL_DEVICE_ID = 'local';

/** 设备清单条目，主进程 devices.json 的单条形状 */
export interface DeviceEntry {
  /** 本机固定为 local，远程主机为握手返回的 hostId */
  hostId: string;
  /** 用户改过的显示名，null 表示未改过 */
  name: string | null;
  /** 握手自称名，服务端 OS hostname，显示名顺序在自称名之前 */
  hostName: string | null;
  /** 最近一次成功连接的地址，本机为 null */
  address: string | null;
  /** 最近一次成功连接的时间戳，毫秒 */
  lastConnectedAt: number | null;
}

/**
 * 暴露给渲染进程的 window.api 接口
 * preload/index.ts 的实现和 renderer/types/window.d.ts 的声明共同引用此接口
 */
export interface WindowAPI {
  selectFolder: (options?: SelectFolderOptions) => Promise<string | null>;
  getConnection: () => Promise<ConnectionSnapshot>;
  getDevices: () => Promise<DeviceEntry[]>;
  upsertDevice: (entry: {
    hostId: string;
    hostName: string;
    address: string;
  }) => Promise<void>;
  renameDevice: (hostId: string, name: string) => Promise<void>;
  removeDevice: (hostId: string) => Promise<boolean>;
  switchHost: (target: {
    hostId: string;
    address: string | null;
  }) => Promise<SwitchResult>;
  /** 连接变更推送，返回退订函数 */
  onConnectionChanged: (
    callback: (snapshot: ConnectionSnapshot) => void
  ) => () => void;
  log: (level: string, ...args: unknown[]) => Promise<void>;
  /** 运行时切换主进程文件日志开关，与 enableLogging 配置联动 */
  setLoggingEnabled: (enabled: boolean) => Promise<void>;
  /** 应用状态存储，读写主进程 electron-store，值统一为字符串 */
  stateGetAll: () => Promise<Record<string, string>>;
  stateSet: (key: string, value: string) => Promise<void>;
  stateDelete: (key: string) => Promise<void>;
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
  /** 本地缓存读写与更新订阅，实现在主进程 cache-ipc */
  cache: {
    getSessions: (agentId: string) => Promise<SessionMeta[]>;
    getSession: (sessionId: string) => Promise<Session | null>;
    getAgents: () => Promise<AgentConfig[]>;
    getCursor: () => Promise<number>;
    applySnapshot: (snapshot: SyncSnapshot) => Promise<void>;
    applyChanges: (changes: SessionChange[]) => Promise<void>;
    putAgents: (agents: AgentConfig[]) => Promise<void>;
    deleteAgent: (agentId: string) => Promise<void>;
    reset: () => Promise<void>;
    /** 缓存写操作后的更新通知，返回退订函数 */
    onChanged: (callback: () => void) => () => void;
  };
}
