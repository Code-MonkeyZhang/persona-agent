/**
 * @file 缓存 IPC 的写入校验直测，假 ipcMain 与假镜像库，
 *   覆盖来源身份与活动库不符拒写、同源放行与库不可用丢弃。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handlers = vi.hoisted(
  () => new Map<string, (...args: unknown[]) => unknown>()
);

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    },
  },
}));

import { registerCacheIpc } from '../src/main/cache/cache-ipc';
import type { CacheDb } from '../src/main/cache/cache-db';
import { IPC } from '@shared/channels';

/** 假镜像库，只带来源身份与两个写方法的探针 */
function makeDb(hostId: string) {
  return {
    sourceHost: hostId,
    applySnapshot: vi.fn(),
    applyChanges: vi.fn(),
  };
}

let active: ReturnType<typeof makeDb> | null = null;

beforeEach(() => {
  handlers.clear();
  active = makeDb('host-b');
  // 探针只实现写入校验用到的表面，经断言充作镜像库
  registerCacheIpc(() => active as unknown as CacheDb | null);
});

describe('同步写入的来源校验', () => {
  it('来源身份与活动库不符时丢弃不落库', () => {
    handlers.get(IPC.CACHE_APPLY_SNAPSHOT)!(undefined, {}, 'host-a');
    handlers.get(IPC.CACHE_APPLY_CHANGES)!(undefined, [], 'host-a');
    expect(active!.applySnapshot).not.toHaveBeenCalled();
    expect(active!.applyChanges).not.toHaveBeenCalled();
  });

  it('来源身份与活动库一致时放行落库', () => {
    const snapshot = {
      sessions: [],
      latestSeq: 0,
      agents: [],
      launcher: null,
    };
    handlers.get(IPC.CACHE_APPLY_SNAPSHOT)!(undefined, snapshot, 'host-b');
    expect(active!.applySnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('库不可用时丢弃不抛错', () => {
    active = null;
    expect(() => {
      handlers.get(IPC.CACHE_APPLY_CHANGES)!(undefined, [], 'host-b');
    }).not.toThrow();
  });
});
