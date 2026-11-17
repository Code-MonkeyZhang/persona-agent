/**
 * @file main/tray.ts
 * @description 托盘控制器 - 管理托盘图标、关闭驻留开关的内存缓存、退出标志与窗口隐藏恢复
 */

import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import type Store from 'electron-store';
import log from 'electron-log';
import { join } from 'path';

/** 托盘控制器的依赖，窗口获取与创建由入口注入，避免本模块反向依赖 index */
interface TrayControllerDeps {
  /** 持有 closeToTray 设置的持久化实例 */
  store: Store;
  /** 取当前主窗口，无窗口时返回 null */
  getMainWindow: () => BrowserWindow | null;
  /** 主窗口不存在时新建，保持入口 createWindow 的唯一创建路径 */
  createMainWindow: () => BrowserWindow;
}

/**
 * 托盘控制器
 * - 托盘随应用常驻，开关只控制关闭行为，避免开关切换产生孤儿隐藏窗口
 * - 退出标志是防误杀机关，before-quit 单点置位后所有退出路径放行真关闭
 */
export class TrayController {
  private readonly deps: TrayControllerDeps;
  private tray: Tray | null = null;
  private quitting = false;
  private closeToTray: boolean;

  constructor(deps: TrayControllerDeps) {
    this.deps = deps;
    this.closeToTray = deps.store.get('closeToTray', true) as boolean;
  }

  /** 创建托盘图标与菜单，在 app ready 后调用一次 */
  setupTray(): void {
    if (this.tray) return;

    const tray = new Tray(TrayController.loadIcon());
    tray.setToolTip('Persona');
    const menu = this.buildMenu();
    if (process.platform === 'darwin') {
      // mac 上 setContextMenu 会让左键弹菜单，改为左键唤回窗口右键弹菜单
      tray.on('click', () => this.showMainWindow());
      tray.on('right-click', () => tray.popUpContextMenu(menu));
    } else {
      tray.setContextMenu(menu);
      tray.on('click', () => this.showMainWindow());
    }
    this.tray = tray;
    log.info('[tray] tray created');
  }

  /** 查询关闭驻留开关的内存值 */
  getCloseToTray(): boolean {
    return this.closeToTray;
  }

  /** 更新关闭驻留开关，持久化与内存缓存同步落位 */
  setCloseToTray(enabled: boolean): void {
    this.closeToTray = enabled;
    this.deps.store.set('closeToTray', enabled);
    log.info(`[tray] closeToTray set to ${enabled}`);
  }

  /** 查询是否已在退出流程，close 处理器据此放行真关闭 */
  isQuitting(): boolean {
    return this.quitting;
  }

  /** 置退出标志，before-quit 里调用一次覆盖托盘退出、快捷键退出与自动更新安装 */
  markQuitting(): void {
    if (this.quitting) return;
    this.quitting = true;
    log.info('[tray] quit marked, close events will pass through');
  }

  /** 把窗口隐藏进托盘，平台分支各走原生正确通道 */
  hideToTray(win: BrowserWindow): void {
    if (process.platform === 'win32') {
      // minimize 让系统把焦点还给下层窗口，透明度置零压掉最小化动画，跳过任务栏移除条目
      win.setOpacity(0);
      win.setSkipTaskbar(true);
      win.minimize();
    } else {
      app.dock?.hide();
      win.hide();
    }
    log.info(`[tray] window hidden to tray on ${process.platform}`);
  }

  /** 唤回主窗口，隐藏副作用逆向清理，窗口不存在时走注入的创建路径 */
  showMainWindow(): void {
    const win = this.deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      log.info('[tray] no live window, creating main window');
      this.deps.createMainWindow();
      return;
    }

    if (process.platform === 'win32') {
      // 先恢复透明度再还原，避免还原瞬间闪出全透明窗口
      win.setOpacity(1);
      win.setSkipTaskbar(false);
      if (win.isMinimized()) win.restore();
    } else {
      app.dock?.show();
    }
    win.show();
    win.focus();
    log.info('[tray] main window shown from tray');
  }

  /** 托盘右键菜单，语言跟随系统 locale，仅保留唤回与退出两个动作 */
  private buildMenu(): Menu {
    const zh = app.getLocale().startsWith('zh');
    return Menu.buildFromTemplate([
      {
        label: zh ? '显示 Persona' : 'Show Persona',
        click: () => this.showMainWindow(),
      },
      { type: 'separator' },
      {
        label: zh ? '退出' : 'Quit',
        click: () => {
          this.markQuitting();
          app.quit();
        },
      },
    ]);
  }

  /** 从应用主图标缩放出 16 与 32 两个尺寸，覆盖普通屏与 retina */
  private static loadIcon(): Electron.NativeImage {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, 'tray-icon.png')
      : join(__dirname, '../../build/icon-mac.png');
    const base = nativeImage.createFromPath(iconPath);
    if (base.isEmpty()) {
      log.error(`[tray] tray icon missing at ${iconPath}`);
      return base;
    }
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({
      scaleFactor: 1,
      buffer: base.resize({ width: 16 }).toPNG(),
    });
    icon.addRepresentation({
      scaleFactor: 2,
      buffer: base.resize({ width: 32 }).toPNG(),
    });
    return icon;
  }
}
