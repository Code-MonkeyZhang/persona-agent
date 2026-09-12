import { describe, it, expect, vi, afterEach } from 'vitest';

/** 每个用例动态重载模块，保证内部缓存与回退标记互不污染 */
async function freshAppStorage(): Promise<typeof import('@/lib/appStorage')> {
  return await import('@/lib/appStorage');
}

describe('appStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('seeds cache from main store and reads synchronously', async () => {
    const stateGetAll = vi.fn().mockResolvedValue({ 'last-agent-id': 'a1' });
    vi.stubGlobal('window', { api: { log: vi.fn(), stateGetAll } });

    const { initAppStorage, appStorage } = await freshAppStorage();
    await initAppStorage();

    expect(appStorage.getItem('last-agent-id')).toBe('a1');
    expect(appStorage.getItem('missing')).toBeNull();
  });

  it('updates memory first and persists through IPC', async () => {
    const stateGetAll = vi.fn().mockResolvedValue({});
    const stateSet = vi.fn().mockResolvedValue(undefined);
    const stateDelete = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('window', {
      api: { log: vi.fn(), stateGetAll, stateSet, stateDelete },
    });

    const { initAppStorage, appStorage } = await freshAppStorage();
    await initAppStorage();

    appStorage.setItem('k', 'v');
    expect(appStorage.getItem('k')).toBe('v');
    expect(stateSet).toHaveBeenCalledWith('k', 'v');

    appStorage.removeItem('k');
    expect(appStorage.getItem('k')).toBeNull();
    expect(stateDelete).toHaveBeenCalledWith('k');
  });

  it('falls back to localStorage when window.api is missing', async () => {
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => (key === 'language' ? 'en' : null)),
      setItem,
      removeItem,
    });

    const { initAppStorage, appStorage } = await freshAppStorage();
    await initAppStorage();

    expect(appStorage.getItem('language')).toBe('en');
    expect(appStorage.getItem('missing')).toBeNull();

    appStorage.setItem('language', 'zh-CN');
    expect(setItem).toHaveBeenCalledWith('language', 'zh-CN');

    appStorage.removeItem('language');
    expect(removeItem).toHaveBeenCalledWith('language');
  });
});
