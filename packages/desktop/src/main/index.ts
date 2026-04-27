/**
 * @file main/index.ts
 * @description Electron 主进程入口文件 - 负责应用程序生命周期管理、窗口创建、进程管理和 IPC 通信
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import log from 'electron-log';
import net from 'net';
import * as fs from 'fs';
import { initStore } from './store';
import {
  waitForServer,
  setServerUrl,
  getServerUrl,
  killOrphanProcesses,
} from './server-manager';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

const BINARY_NAME = isWin ? 'persona-agent-server.exe' : 'persona-agent-server';

let serverProcess: ChildProcess | null = null;
let settingsWindow: BrowserWindow | null = null;

// 日志配置：开发环境写文件，生产环境不写
if (is.dev) {
  const logPath = join(__dirname, '../../logs');
  const logFile = join(logPath, 'main.log');
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }
  log.transports.file.resolvePath = () => logFile;
  log.transports.console.level = false;
} else {
  log.transports.file.level = false;
}

log.info('App starting...');

/** 获取后端二进制路径：开发环境从项目构建产物取，生产环境从 app 包内取 */
function getBinaryPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/dist', BINARY_NAME);
  }
  return join(process.resourcesPath, 'bin', BINARY_NAME);
}

/**
 * 查找可用的网络端口
 * 通过尝试监听随机端口来查找可用端口
 * @returns {Promise<number>} 可用端口号
 * @throws {Error} 获取端口失败时抛出错误
 */
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err);
    });
    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });
    server.listen(0, '127.0.0.1');
  });
}

/**
 * 启动后端服务器
 * 先清理孤儿进程，再从 app 包内直接启动二进制
 */
async function startServer(): Promise<void> {
  killOrphanProcesses();

  let port: number;
  try {
    port = await findAvailablePort();
    log.info(`Found available port: ${port}`);
  } catch (err: unknown) {
    log.error('Failed to find available port:', err);
    return;
  }

  const url = `http://localhost:${port}`;
  const binaryPath = getBinaryPath();
  log.info(`Starting server from: ${binaryPath} on port ${port}`);

  serverProcess = spawn(binaryPath, [String(port)], {
    stdio: 'inherit',
  });

  serverProcess.on('error', (err) => {
    log.error('Failed to start server:', err);
  });

  try {
    await waitForServer(url);
    setServerUrl(url);
    log.info(`Server started at ${url}`);
  } catch (err) {
    log.error('Server failed to start:', err);
  }
}

/**
 * 创建主应用程序窗口
 * 初始化浏览器窗口、加载渲染进程内容、配置 WebPreferences
 * @returns {void}
 */
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 8, y: 13 } }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-changed', false);
  });

  // 窗口准备好显示时触发，此时内部资源已加载完成
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // 处理窗口内打开新链接的行为, 调用系统默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    require('electron').shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 根据环境决定加载页面
  // 开发环境加载开发服务器的 URL（支持热更新），生产环境加载打包后的静态文件
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * 创建设置窗口
 * 用于显示应用程序设置界面
 * @returns {void}
 */
function createSettingsWindow(): void {
  log.info('Creating settings window');

  // 如果设置窗口已经存在，直接聚焦到已有窗口，避免重复创建
  if (settingsWindow) {
    log.info('Settings window already exists, focusing');
    settingsWindow.focus();
    return;
  }

  // 创建一个新的浏览器窗口作为设置界面
  settingsWindow = new BrowserWindow({
    width: 720,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    show: false, // 先不显示，等 ready-to-show 事件再显示，避免白屏闪烁
    autoHideMenuBar: true,
    title: '设置中心',
    resizable: true,
    maximizable: false, // 禁止最大化，设置窗口不需要那么大
    fullscreenable: false, // 禁止全屏
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 窗口内容加载完成后才显示，用户体验更好
  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show();
  });

  // 窗口关闭时清空引用，允许下次重新创建
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  // 拦截页面内的新窗口打开请求（如 <a target="_blank">），用系统浏览器打开
  settingsWindow.webContents.setWindowOpenHandler((details) => {
    require('electron').shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // 加载同一个 index.html，但 URL 末尾拼接 #settings
  // 渲染进程的 App 组件会读取这个 hash 值，据此渲染 <SettingsWindow /> 而非聊天界面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    settingsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#settings`);
  } else {
    settingsWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'settings',
    });
  }
}

/**
 * 应用的主要入口
 * @returns {Promise<void>}
 */
app.whenReady().then(async () => {
  initStore();

  process.on('SIGINT', () => {
    serverProcess?.kill();
    app.quit();
  });

  process.on('SIGTERM', () => {
    serverProcess?.kill();
    app.quit();
  });

  electronApp.setAppUserModelId('com.persona.desktop');

  /**
   * 监听窗口创建事件
   * 自动优化窗口快捷键（如 DevTools、F5 刷新等）
   */
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  /**
   * IPC 处理器：接受前端发来的消息 打开设置窗口
   */
  ipcMain.handle('open-settings-window', () => {
    log.info('IPC: open-settings-window received');
    createSettingsWindow();
  });

  /**
   * IPC 处理器：获取当前服务器 URL
   */
  ipcMain.handle('get-server-url', () => {
    return getServerUrl();
  });

  /**
   * IPC 处理器：打开文件夹选择对话框
   */
  ipcMain.handle(
    'select-folder',
    async (_event, options?: { title?: string; defaultPath?: string }) => {
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

  /**
   * IPC 处理器：窗口控制操作，将最小化、最大化、取消最大化、关闭、查询最大化状态委托给当前聚焦窗口
   */
  ipcMain.handle('window:minimize', () =>
    BrowserWindow.getFocusedWindow()?.minimize()
  );
  ipcMain.handle('window:maximize', () =>
    BrowserWindow.getFocusedWindow()?.maximize()
  );
  ipcMain.handle('window:unmaximize', () =>
    BrowserWindow.getFocusedWindow()?.unmaximize()
  );
  ipcMain.handle('window:close', () =>
    BrowserWindow.getFocusedWindow()?.close()
  );
  ipcMain.handle(
    'window:is-maximized',
    () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false
  );

  /**
   * IPC 处理器：将渲染进程的日志转发到主进程日志，仅在开发环境生效
   */
  ipcMain.handle('log', (_event, level: string, ...args: unknown[]) => {
    if (is.dev) {
      const logFn = log[level as keyof typeof log];
      if (typeof logFn === 'function') {
        logFn(`[Renderer]`, ...args);
      }
    }
  });

  /**
   * IPC 处理器：代理 HTTP 请求，绕过渲染进程的 CORS 限制
   * 主进程运行在 Node.js 环境，可直接使用全局 fetch，不受浏览器 CORS 策略约束
   */
  ipcMain.handle(
    'proxy-fetch',
    async (
      _event,
      url: string,
      options: {
        method: string;
        headers: Record<string, string>;
        body?: string;
      }
    ) => {
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

  await startServer();

  createWindow();

  /**
   * macOS 应用激活事件处理
   * 当应用被点击或 Dock 图标被点击时，如果无窗口则创建
   */
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * 所有窗口关闭事件处理 在非 macOS 平台上退出应用
 * @returns {void}
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 应用退出前终止后端服务器进程，同生同死
 */
app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
      log.info('Server process killed on app quit');
    } catch {
      // Process may have already exited
    }
    serverProcess = null;
  }
});
