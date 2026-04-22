/**
 * @file main/index.ts
 * @description Electron 主进程入口文件 - 负责应用程序生命周期管理、窗口创建、进程管理和 IPC 通信
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { spawn } from 'child_process';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import log from 'electron-log';
import net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import { initStore, getStore } from './store';
import {
  findExistingServer,
  waitForServer,
  getServerUrl,
  killServer,
} from './server-manager';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let settingsWindow: BrowserWindow | null = null; // 判断设置窗口是否存在的全局变量

const APP_NAME = '.nano-agent';
const BINARY_NAME = isWin ? 'nano-agent.exe' : 'nano-agent';
const CLOUDFLARED_NAME = isWin ? 'cloudflared.exe' : 'cloudflared';

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

/** 获取用户级别的二进制文件存放目录 */
function getUserBinDir(): string {
  return join(os.homedir(), APP_NAME, 'bin');
}

/** 获取已安装到用户目录的 nano-agent 二进制路径 */
function getInstalledBinaryPath(): string {
  return join(getUserBinDir(), BINARY_NAME);
}

/** 获取 nano-agent 源二进制路径：开发环境从项目构建产物取，生产环境从打包资源目录取 */
function getSourceBinaryPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/dist', BINARY_NAME);
  } else {
    return join(process.resourcesPath, 'bin', BINARY_NAME);
  }
}

/** 获取已安装到用户目录的 cloudflared 二进制路径 */
function getCloudflaredInstalledPath(): string {
  return join(getUserBinDir(), CLOUDFLARED_NAME);
}

/** 获取 cloudflared 源二进制路径：开发环境从项目 bin 目录取，生产环境从打包资源目录取 */
function getCloudflaredSourcePath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/bin', CLOUDFLARED_NAME);
  } else {
    return join(process.resourcesPath, 'bin', CLOUDFLARED_NAME);
  }
}

/**
 * 确保 nano-agent 二进制文件已安装到用户目录
 * 首次启动时将二进制从包内复制到 ~/.nano-agent/bin/，后续启动直接复用
 */
async function ensureBinaryInstalled(): Promise<void> {
  const installedPath = getInstalledBinaryPath();
  const sourcePath = getSourceBinaryPath();

  // 非开发环境且已安装则跳过
  if (!is.dev && fs.existsSync(installedPath)) {
    log.info(`Binary already installed at: ${installedPath}`);
    return;
  }

  log.info(`Installing binary from ${sourcePath} to ${installedPath}`);

  // 确保用户 bin 目录存在
  const binDir = getUserBinDir();
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
    log.info(`Created directory: ${binDir}`);
  }

  // 源文件不存在则报错
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source binary not found at: ${sourcePath}`);
  }

  // 复制二进制到用户目录
  fs.copyFileSync(sourcePath, installedPath);
  log.info(`Copied binary to: ${installedPath}`);

  // macOS/Linux 需要赋予可执行权限
  if (!isWin) {
    fs.chmodSync(installedPath, 0o755);
    log.info(`Set executable permission for: ${installedPath}`);
  }
}

/**
 * 确保 cloudflared 二进制文件已安装到用户目录
 * 逻辑与 ensureBinaryInstalled 相同，区别在于源文件缺失时仅警告跳过（cloudflared 是可选的隧道工具）
 */
async function ensureCloudflaredInstalled(): Promise<void> {
  const installedPath = getCloudflaredInstalledPath();
  const sourcePath = getCloudflaredSourcePath();

  if (!is.dev && fs.existsSync(installedPath)) {
    log.info(`Cloudflared already installed at: ${installedPath}`);
    return;
  }

  log.info(`Installing cloudflared from ${sourcePath} to ${installedPath}`);

  const binDir = getUserBinDir();
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
    log.info(`Created directory: ${binDir}`);
  }

  if (!fs.existsSync(sourcePath)) {
    log.warn(`Cloudflared source binary not found at: ${sourcePath}, skipping`);
    return;
  }

  fs.copyFileSync(sourcePath, installedPath);
  log.info(`Copied cloudflared to: ${installedPath}`);

  if (!isWin) {
    fs.chmodSync(installedPath, 0o755);
    log.info(`Set executable permission for: ${installedPath}`);
  }
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
 * 启动 Nano Agent 服务器
 * 首先检测已有服务器，如果没有则启动新的独立进程
 * @returns {Promise<void>} 启动完成后的异步操作
 */
async function startNanoAgent(): Promise<void> {
  if (is.dev) {
    const existingUrl = findExistingServer();
    if (existingUrl) {
      log.info('Dev mode: killing existing server to use latest binary');
      killServer();
    }
  } else {
    const existingUrl = findExistingServer();
    if (existingUrl) {
      log.info(`Reusing existing server at ${existingUrl}`);
      return;
    }
  }

  try {
    await ensureBinaryInstalled();
    await ensureCloudflaredInstalled();
  } catch (err: unknown) {
    log.error('Failed to ensure binary installed:', err);
    return;
  }

  let port: number;
  try {
    port = await findAvailablePort();
    log.info(`Found available port: ${port}`);
  } catch (err: unknown) {
    log.error('Failed to find available port:', err);
    return;
  }

  const serverUrl = `http://localhost:${port}`;

  const binaryPath = getInstalledBinaryPath();
  log.info(`Starting nano-agent from: ${binaryPath}`);

  const proc = spawn(binaryPath, [String(port)], {
    stdio: 'inherit',
    detached: true,
  });

  proc.unref();

  proc.on('error', (err) => {
    log.error('Failed to start nano-agent:', err);
  });

  try {
    await waitForServer(serverUrl);
    log.info(`Server started at ${serverUrl}`);
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
    const s = getStore();
    if (s?.get('killServerOnExit', false)) {
      killServer();
    }
    app.quit();
  });

  process.on('SIGTERM', () => {
    const s = getStore();
    if (s?.get('killServerOnExit', false)) {
      killServer();
    }
    app.quit();
  });

  electronApp.setAppUserModelId('com.nano-agent.desktop');

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
   * IPC 处理器：读取桌面端配置（如是否退出时关闭服务器）
   */
  ipcMain.handle('get-desktop-config', () => {
    const s = getStore();
    if (!s) return { killServerOnExit: false };
    return { killServerOnExit: s.get('killServerOnExit', false) };
  });

  /**
   * IPC 处理器：写入桌面端配置
   */
  ipcMain.handle(
    'set-desktop-config',
    (_event, config: { killServerOnExit: boolean }) => {
      const s = getStore();
      if (!s) return;
      s.set('killServerOnExit', config.killServerOnExit);
    }
  );

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

  await startNanoAgent();

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
 * 应用退出前检查配置，若 killServerOnExit 为 true 则终止后端服务器进程
 */
app.on('before-quit', () => {
  const s = getStore();
  if (!s) return;
  const killOnExit = s.get('killServerOnExit', false);
  if (killOnExit) {
    killServer();
  }
});
