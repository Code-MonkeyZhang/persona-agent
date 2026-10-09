/**
 * @file main/index.ts
 * @description Electron 主进程入口文件 - 负责应用生命周期管理、窗口创建和 IPC 通信
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import log from 'electron-log';
import { xdgData } from 'xdg-basedir';
import * as fs from 'fs';
import { initStore } from './store';
import { registerCacheIpc } from './cache/cache-ipc';
import { ImageCache } from './image/image-cache';
import {
  registerImageSchemePrivileges,
  registerImageProtocol,
} from './image/image-protocol';
import { HostManager } from './host/host-manager';
import { LocalHostProvider } from './host/local-host-provider';
import { IPC } from '@shared/channels';
import type { ProxyFetchOptions, SelectFolderOptions } from '@shared/api';
import { setupUpdater } from './updater';

const isMac = process.platform === 'darwin';

// 日志配置。dev 与正式版统一写入用户数据目录 logs/desktop.log，与 server
// 的 agent-server.log 同目录，每次启动清空，路径规则与 server 侧 util/paths.ts 一致
if (!xdgData) {
  throw new Error('Unable to determine XDG data directory');
}
const DATA_DIR = join(xdgData, 'persona-agent');
const LOGS_DIR = join(DATA_DIR, 'logs');
const LOG_FILE = join(LOGS_DIR, 'desktop.log');

/** 本机服务端的提供方式，HostManager 通过它拿到本机那条连接 */
const localProvider = new LocalHostProvider();

/** 镜像库数据变化时通知全部窗口 */
function broadcastCacheChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.CACHE_CHANGED);
  }
}

/** 连接事实的唯一来源，渲染层与镜像层只认它给出的连接 */
const hostManager = new HostManager(
  localProvider,
  DATA_DIR,
  broadcastCacheChanged
);

// 连接变更广播给全部窗口，渲染层据此换地址重连重追平
hostManager.subscribe((snapshot) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.CONNECTION_CHANGED, snapshot);
  }
});

/**
 * 从 server 的 config.yaml 读取日志开关
 * 文件由 server 侧 yaml.stringify 写出，行格式固定，按行匹配即可
 */
function readEnableLogging(): boolean {
  try {
    const content = fs.readFileSync(
      join(DATA_DIR, 'config', 'config.yaml'),
      'utf-8'
    );
    const match = content.match(/^enableLogging:\s*(true|false)\s*$/m);
    return match?.[1] === 'true';
  } catch {
    return false;
  }
}

/**
 * 切换文件日志开关，开启时确保日志目录存在
 * @param enabled - 是否写入日志文件
 */
function setFileLogging(enabled: boolean): void {
  if (enabled) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  log.transports.file.level = enabled ? 'info' : false;
}

if (fs.existsSync(LOG_FILE)) {
  fs.unlinkSync(LOG_FILE);
}
log.transports.file.resolvePath = () => LOG_FILE;
setFileLogging(readEnableLogging());
if (is.dev) {
  log.transports.console.level = false;
}

log.info(`[log] desktop.log at ${LOG_FILE}`);
log.info('App starting...');

// 图片协议的特权声明必须发生在 app ready 之前，放 whenReady 里会静默失效
registerImageSchemePrivileges();

/** 应用主入口 */
app.whenReady().then(async () => {
  initStore();

  // 图片缓存命中读数据根 image-cache，未命中经当前连接地址下载校验落盘
  registerImageProtocol(
    new ImageCache(join(DATA_DIR, 'image-cache'), (message) =>
      log.info(message)
    ),
    () => hostManager.getAddress()
  );

  process.on('SIGINT', () => {
    localProvider.kill();
    app.quit();
  });

  process.on('SIGTERM', () => {
    localProvider.kill();
    app.quit();
  });

  electronApp.setAppUserModelId('com.persona.desktop');

  // 监听窗口创建事件，自动优化窗口快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC：查询连接事实，current 是当前连接，local 是本机常驻连接
  ipcMain.handle(IPC.GET_CONNECTION, () => {
    return hostManager.getSnapshot();
  });

  // IPC：查询设备清单，主进程 devices.json 的只读镜像
  ipcMain.handle(IPC.GET_DEVICES, () => {
    return hostManager.getDevices();
  });

  // IPC：条目落位，新建连接识别完成后调用
  ipcMain.handle(
    IPC.DEVICE_UPSERT,
    (_event, entry: { hostId: string; hostName: string; address: string }) => {
      hostManager.upsertDevice(entry.hostId, entry.hostName, entry.address);
    }
  );

  // IPC：设备改名，只动本机显示
  ipcMain.handle(IPC.DEVICE_RENAME, (_event, hostId: string, name: string) => {
    hostManager.renameDevice(hostId, name);
  });

  // IPC：删除设备条目并释放本地镜像，本机不可删
  ipcMain.handle(IPC.DEVICE_REMOVE, (_event, hostId: string) => {
    return hostManager.removeDevice(hostId);
  });

  // IPC：发起主机切换，主进程内串行原子执行
  ipcMain.handle(
    IPC.SWITCH_HOST,
    (_event, target: { hostId: string; address: string | null }) => {
      return hostManager.switchHost(target.hostId, target.address);
    }
  );

  // IPC：打开文件夹选择对话框
  ipcMain.handle(
    IPC.SELECT_FOLDER,
    async (_event, options?: SelectFolderOptions) => {
      log.info('IPC: select-folder received', options);
      const result = await dialog.showOpenDialog({
        title: options?.title || '选择文件夹',
        defaultPath: options?.defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  // IPC：窗口控制操作
  ipcMain.handle(IPC.WINDOW_MINIMIZE, () =>
    BrowserWindow.getFocusedWindow()?.minimize()
  );
  ipcMain.handle(IPC.WINDOW_MAXIMIZE, () =>
    BrowserWindow.getFocusedWindow()?.maximize()
  );
  ipcMain.handle(IPC.WINDOW_UNMAXIMIZE, () =>
    BrowserWindow.getFocusedWindow()?.unmaximize()
  );
  ipcMain.handle(IPC.WINDOW_CLOSE, () =>
    BrowserWindow.getFocusedWindow()?.close()
  );
  ipcMain.handle(
    IPC.WINDOW_IS_MAXIMIZED,
    () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  );

  // IPC：将渲染进程日志转发到主进程日志
  ipcMain.handle(IPC.LOG, (_event, level: string, ...args: unknown[]) => {
    const logFn = log[level as keyof typeof log];
    if (typeof logFn === 'function') {
      logFn('[Renderer]', ...args);
    }
  });

  // IPC：运行时切换文件日志开关，与设置页的 enableLogging 联动
  ipcMain.handle(IPC.SET_LOGGING_ENABLED, (_event, enabled: boolean) => {
    setFileLogging(enabled);
  });

  // IPC：代理 HTTP 请求，绕过渲染进程的 CORS 限制
  // 主进程运行在 Node.js 环境，可直接使用全局 fetch，不受浏览器 CORS 策略约束
  ipcMain.handle(
    IPC.PROXY_FETCH,
    async (_event, url: string, options: ProxyFetchOptions) => {
      log.info(`[proxyFetch] ${options.method} ${url}`);
      try {
        const response = await fetch(url, {
          method: options.method,
          headers: options.headers,
          body: options.body,
        });
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
        const body = await response.arrayBuffer();
        log.info(
          `[proxyFetch] Response: status=${response.status}, bodySize=${body.byteLength}`
        );
        return { ok: response.ok, status: response.status, headers, body };
      } catch (err) {
        log.error(`[proxyFetch] Network error for ${url}:`, err);
        throw err;
      }
    }
  );

  // IPC：使用系统默认浏览器打开指定 URL
  ipcMain.handle(IPC.OPEN_EXTERNAL, (_event, url: string) => {
    return shell.openExternal(url);
  });

  ipcMain.handle(IPC.OPEN_PATH, async (_event, filePath: string) => {
    const resolved = filePath.replace(/^~/, homedir());
    log.info('[openPath] input:', filePath, 'resolved:', resolved);
    const result = await shell.openPath(resolved);
    if (result) {
      log.error('[openPath] failed:', result);
    }
    return result;
  });

  // 启动编排：先建立本机连接，镜像库与设备清单随连接在 HostManager 内就位
  await hostManager.ensureLocal();

  // 缓存 IPC 注册一次不随切换重建，handler 经 getter 取当前库
  registerCacheIpc(() => hostManager.getCacheDb());

  const mainWindow = createWindow();

  // 安装更新前经 provider 优雅停止本机服务端进程
  setupUpdater(mainWindow, () => localProvider.stop());

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS 设计惯例：关闭app所有窗口后，应用仍在 Dock 栏存活，用户点击 Dock 图标可以重新打开窗口。对于其他平台关闭是退出应用。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  hostManager.closeCache();
  localProvider.kill();
});

/**
 * 创建主应用窗口
 * 初始化 BrowserWindow、加载渲染进程内容、配置 WebPreferences
 */
function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 620,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 8, y: 12 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZED_CHANGED, false);
  });

  // 窗口准备好显示时触发，此时内部资源已加载完成
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // 处理窗口内打开新链接的行为，调用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 根据环境决定加载页面
  // 开发环境加载 dev server URL，生产环境加载打包后的静态文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
