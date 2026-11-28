/**
 * @file tests/updater-state.test.ts
 * @description 主进程更新状态缓存：渲染层卸载期间收到的 update-downloaded 事件，
 * 之后挂载的组件仍应能通过 UPDATER_GET_STATE 拿到 downloaded 状态
 */
import { describe, it, expect, vi } from 'vitest';
import { BrowserWindow, ipcMain } from 'electron';
import pkg from 'electron-updater';
import { IPC } from '@shared/channels';
import { setupUpdater } from '../src/main/updater';

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  BrowserWindow: class {},
  ipcMain: { handle: vi.fn() },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('electron-updater', () => {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  return {
    default: {
      autoUpdater: {
        on: (event: string, fn: (...args: unknown[]) => void) => {
          listeners.set(event, fn);
        },
        emit: (event: string, ...args: unknown[]) => {
          listeners.get(event)?.(...args);
        },
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(),
        quitAndInstall: vi.fn(),
      },
    },
  };
});

const updater = pkg.autoUpdater as unknown as {
  emit: (event: string, ...args: unknown[]) => void;
};

const handlerFor = (channel: string): (() => unknown) | undefined =>
  vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([ch]) => ch === channel)?.[1] as
    | (() => unknown)
    | undefined;

describe('updater state cache', () => {
  it('returns downloaded after the event fired with no renderer listening', async () => {
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    } as unknown as BrowserWindow;

    setupUpdater(mainWindow, async () => {});
    updater.emit('update-downloaded', { version: '2.0.0' });

    const state = await handlerFor(IPC.UPDATER_GET_STATE)?.();

    expect(state).toEqual({ type: 'downloaded' });
  });
});
