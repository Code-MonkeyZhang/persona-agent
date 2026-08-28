/**
 * @file main/index.ts
 * @description Electron 主进程入口文件 - 负责应用生命周期管理、窗口创建、进程管理和 IPC 通信
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
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
import { IPC } from '@shared/ipc/channels';
import type { ProxyFetchOptions, SelectFolderOptions } from '@shared/types/api';
import { setupUpdater } from './updater';

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const BINARY_NAME = isWin ? 'persona-agent-server.exe' : 'persona-agent-server';
const CLOUDFLARED_NAME = isWin ? 'cloudflared.exe' : 'cloudflared';

let serverProcess: ChildProcess | null = null;

/**
 * 停止后端服务器进程
 * - 发送 SIGTERM 请求优雅退出
 * - 等待 close 事件，超时 5 秒后 SIGKILL 强杀
 * - 用于安装更新前确保子进程完全退出
 */
async function stopServer(): Promise<void> {
  const proc = serverProcess;
  if (!proc) return;
  serverProcess = null;
  try {
    proc.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          // 进程已退出
        }
        resolve();
      }, 5000);
      proc.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    log.info('Server process stopped for update install');
  } catch {
    log.debug('Server process already exited');
  }
}

// 日志配置
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

/** 应用主入口 */
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

  // 监听窗口创建事件，自动优化窗口快捷键
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC：获取当前服务器 URL
  ipcMain.handle(IPC.GET_SERVER_URL, () => {
    return getServerUrl();
  });

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
    if (is.dev) {
      const logFn = log[level as keyof typeof log];
      if (typeof logFn === 'function') {
        logFn(`[Renderer]`, ...args);
      }
    }
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

  await startServer();

  const mainWindow = createWindow();

  setupUpdater(mainWindow, stopServer);

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
  if (serverProcess) {
    try {
      serverProcess.kill();
      log.info('Server process killed on app quit');
    } catch {
      log.debug('服务器进程已退出');
    }
    serverProcess = null;
  }
});

function getBinaryPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/dist', BINARY_NAME);
  }
  return join(process.resourcesPath, 'bin', BINARY_NAME);
}

/**
 * 返回 cloudflared 二进制路径。
 * dev 模式下位于 packages/server/bin，生产模式位于 resources/bin。
 * 通过环境变量传递给 server 进程。
 */
function getCloudflaredPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/bin', CLOUDFLARED_NAME);
  }
  return join(process.resourcesPath, 'bin', CLOUDFLARED_NAME);
}

/**
 * 返回初始 Agent 播种模板目录。
 * dev 模式下位于仓库 packages/server/templates，生产模式位于 resources/templates。
 * 通过环境变量传递给 server 进程，播种语言由 server 端检测。
 */
function getTemplatesPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/templates');
  }
  return join(process.resourcesPath, 'templates');
}

/**
 * 查找可用的网络端口
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
 * 先清理孤儿进程，再启动二进制
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
  const cloudflaredPath = getCloudflaredPath();
  const templatesPath = getTemplatesPath();
  log.info(`Starting server from: ${binaryPath} on port ${port}`);
  log.info(`Cloudflared path: ${cloudflaredPath}`);
  log.info(`Templates path: ${templatesPath}`);

  serverProcess = spawn(binaryPath, [String(port)], {
    stdio: 'pipe',
    windowsHide: true,
    env: {
      ...process.env,
      PERSONA_CLOUDFLARED_BIN_PATH: cloudflaredPath,
      PERSONA_AGENT_TEMPLATE_DIR: templatesPath,
    },
  });

  serverProcess.on('error', (err) => {
    log.error('Failed to start server:', err);
  });

  serverProcess.stdout?.on('data', (data) => {
    log.info(`[server] ${data.toString().trimEnd()}`);
  });
  serverProcess.stderr?.on('data', (data) => {
    log.error(`[server] ${data.toString().trimEnd()}`);
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
