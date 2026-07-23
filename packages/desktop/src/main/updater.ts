/**
 * @file main/updater.ts
 * @description electron-updater 集成模块
 * - 注册 IPC handler 供渲染层调用检查/下载/安装
 * - 监听 electron-updater 事件并推送给渲染层
 * - installUpdate 前先调 stopServer 确保子进程退出
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import pkg from 'electron-updater';
import log from 'electron-log';
import { IPC } from '@shared/ipc/channels';
import type { UpdateStatus } from '@shared/types/api';

const { autoUpdater } = pkg;

/**
 * 初始化自动更新模块
 * @param mainWindow - 主窗口引用，用于向渲染层推送事件
 * @param stopServer - 安装更新前调用的子进程清理函数
 */
export function setupUpdater(
  mainWindow: BrowserWindow,
  stopServer: () => Promise<void>
): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = log;

  /** 安全推送事件到渲染层，窗口已销毁时跳过 */
  const send = (channel: string, data: unknown): void => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  };

  // electron-updater 事件 → 推送给渲染层
  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] checking for updates');
    send(IPC.UPDATER_STATUS_CHANGED, {
      type: 'checking',
    } satisfies UpdateStatus);
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`[updater] update available: ${info.version}`);
    send(IPC.UPDATER_STATUS_CHANGED, {
      type: 'update-available',
      version: info.version,
    } satisfies UpdateStatus);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] already up to date');
    send(IPC.UPDATER_STATUS_CHANGED, {
      type: 'update-not-available',
    } satisfies UpdateStatus);
  });

  autoUpdater.on('download-progress', (progress) => {
    send(IPC.UPDATER_DOWNLOAD_PROGRESS, { percent: progress.percent });
  });

  autoUpdater.on('update-downloaded', () => {
    log.info('[updater] update downloaded, ready to install');
    send(IPC.UPDATER_STATUS_CHANGED, {
      type: 'downloaded',
    } satisfies UpdateStatus);
  });

  autoUpdater.on('error', (err) => {
    log.error('[updater] error:', err?.message ?? err);
    send(IPC.UPDATER_STATUS_CHANGED, {
      type: 'error',
      message: err?.message ?? 'Unknown error',
    } satisfies UpdateStatus);
  });

  // IPC handler
  ipcMain.handle(IPC.UPDATER_GET_VERSION, () => app.getVersion());

  ipcMain.handle(IPC.UPDATER_CHECK_FOR_UPDATES, async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      log.error('[updater] check failed:', err);
    }
  });

  ipcMain.handle(IPC.UPDATER_DOWNLOAD_UPDATE, async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      log.error('[updater] download failed:', err);
    }
  });

  ipcMain.handle(IPC.UPDATER_INSTALL_UPDATE, async () => {
    log.info('[updater] installing update, stopping server first');
    await stopServer();
    autoUpdater.quitAndInstall();
  });
}
