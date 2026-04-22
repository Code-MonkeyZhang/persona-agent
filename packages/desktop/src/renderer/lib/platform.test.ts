import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

describe('Platform Detection', () => {
  const originalWindow = global.window;

  beforeAll(() => {
    vi.resetModules();
  });

  afterAll(() => {
    global.window = originalWindow;
    vi.resetModules();
  });

  it('should detect macOS correctly', async () => {
    global.window = {
      electron: {
        ipcRenderer: { invoke: vi.fn() },
        process: { platform: 'darwin' },
      },
    } as unknown as Window & typeof globalThis;

    const { isMac, isWin, isLinux } = await import('./platform');
    expect(isMac).toBe(true);
    expect(isWin).toBe(false);
    expect(isLinux).toBe(false);
  });

  it('should detect Windows correctly', async () => {
    vi.resetModules();
    global.window = {
      electron: {
        ipcRenderer: { invoke: vi.fn() },
        process: { platform: 'win32' },
      },
    } as unknown as Window & typeof globalThis;

    const { isMac, isWin, isLinux } = await import('./platform');
    expect(isMac).toBe(false);
    expect(isWin).toBe(true);
    expect(isLinux).toBe(false);
  });

  it('should detect Linux correctly', async () => {
    vi.resetModules();
    global.window = {
      electron: {
        ipcRenderer: { invoke: vi.fn() },
        process: { platform: 'linux' },
      },
    } as unknown as Window & typeof globalThis;

    const { isMac, isWin, isLinux } = await import('./platform');
    expect(isMac).toBe(false);
    expect(isWin).toBe(false);
    expect(isLinux).toBe(true);
  });

  it('should handle undefined electron object', async () => {
    vi.resetModules();
    global.window = {} as unknown as Window & typeof globalThis;

    const { isMac, isWin, isLinux } = await import('./platform');
    expect(isMac).toBe(false);
    expect(isWin).toBe(false);
    expect(isLinux).toBe(false);
  });
});
