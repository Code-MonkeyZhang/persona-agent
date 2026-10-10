/**
 * @fileoverview 同步引擎测试：冷启动镜像、分页追平、串行队列与容错。
 */

import { describe, it, expect } from 'vitest';
import type { SessionChange, SyncSnapshot } from '@persona/shared';
import { SyncEngine, type SyncDeps } from '@/lib/sync-engine';

/** 造变更事件 */
function change(seq: number): SessionChange {
  return {
    seq,
    kind: 'message_appended',
    sessionId: 's1',
    data: {},
    createdAt: seq,
  };
}

/** 造快照 */
function snapshot(latestSeq: number): SyncSnapshot {
  return { latestSeq, sessions: [], agents: [] };
}

/**
 * 假依赖集合。
 * 覆盖行为时测试自行 push 调用记录，默认实现记录完整序列。
 */
function makeDeps(
  overrides: Partial<SyncDeps> & { calls: string[] }
): SyncDeps & { calls: string[] } {
  return {
    fetchSnapshot: async () => {
      overrides.calls.push('snapshot');
      return snapshot(10);
    },
    fetchChanges: async (since: number) => {
      overrides.calls.push(`fetch:${since}`);
      return { changes: [change(since + 1)], head: since + 1 };
    },
    getCursor: async () => 0,
    applySnapshot: async (s: SyncSnapshot) => {
      overrides.calls.push(`apply-snapshot:${s.latestSeq}`);
    },
    applyChanges: async (changes: SessionChange[]) => {
      overrides.calls.push(`apply:${changes.map((c) => c.seq).join(',')}`);
    },
    onStateChange: () => {},
    log: () => {},
    ...overrides,
  };
}

/** 等待队列排空，每个宏任务轮次让微任务全部走完 */
function settle(times = 3): Promise<void> {
  return (async () => {
    for (let i = 0; i < times; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })();
}

describe('SyncEngine', () => {
  /** 测试冷启动游标为零先镜像再追平到 head */
  it('should mirror then catch up on cold start', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      calls,
      getCursor: async () => {
        calls.push('cursor:0');
        return 0;
      },
      fetchChanges: async (since: number) => {
        calls.push(`fetch:${since}`);
        if (since === 10) return { changes: [change(11)], head: 11 };
        return { changes: [], head: 11 };
      },
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    await settle();

    expect(calls).toEqual([
      'cursor:0',
      'snapshot',
      'apply-snapshot:10',
      'fetch:10',
      'apply:11',
    ]);
  });

  /** 测试热启动游标非零跳过镜像，追平一页后停在 head */
  it('should skip snapshot when cursor is non-zero', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      calls,
      getCursor: async () => {
        calls.push('cursor:20');
        return 20;
      },
      fetchChanges: async (since: number) => {
        calls.push(`fetch:${since}`);
        return { changes: [], head: 20 };
      },
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    await settle();

    expect(calls).toEqual(['cursor:20', 'fetch:20']);
  });

  /** 测试多页追平按序回放到 head */
  it('should page through changes in order', async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      calls,
      getCursor: async () => 0,
      fetchSnapshot: async () => {
        calls.push('snapshot');
        return snapshot(0);
      },
      fetchChanges: async (since: number) => {
        calls.push(`fetch:${since}`);
        if (since === 0) return { changes: [change(1), change(2)], head: 5 };
        if (since === 2) return { changes: [change(3)], head: 5 };
        return { changes: [change(4), change(5)], head: 5 };
      },
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    await settle();

    expect(calls).toEqual([
      'snapshot',
      'apply-snapshot:0',
      'fetch:0',
      'apply:1,2',
      'fetch:2',
      'apply:3',
      'fetch:3',
      'apply:4,5',
    ]);
  });

  /** 测试追平期间的推送变更排队在批次之后串行执行 */
  it('should serialize pushed changes after in-flight catch-up', async () => {
    const calls: string[] = [];
    let releaseFetch: () => void = () => {};
    const deps = makeDeps({
      calls,
      getCursor: async () => 10,
      fetchChanges: () =>
        new Promise((resolve) => {
          calls.push('fetch:10');
          releaseFetch = () => resolve({ changes: [change(11)], head: 11 });
        }),
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    // 追平的 fetch 挂起时推送到达，必须排在批次之后
    engine.onChange(change(12));
    await settle(1);

    expect(calls).toEqual(['fetch:10']);

    releaseFetch();
    await settle();

    expect(calls).toEqual(['fetch:10', 'apply:11', 'apply:12']);
  });

  /** 测试失败落日志不阻断后续队列 */
  it('should log failure and keep queue alive', async () => {
    const calls: string[] = [];
    const logs: string[] = [];
    const deps = makeDeps({
      calls,
      getCursor: async () => {
        throw new Error('db offline');
      },
      log: (message: string) => logs.push(message),
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    await settle(1);
    expect(logs.some((m) => m.includes('db offline'))).toBe(true);

    // 队列未死，下一次操作照常执行
    engine.onChange(change(1));
    await settle(1);
    expect(calls).toEqual(['apply:1']);
  });

  /** 测试追平周期对外发 syncing 到 idle，单条回放不触发状态回调 */
  it('should emit syncing then idle for sync and stay silent for onChange', async () => {
    const states: string[] = [];
    const deps = makeDeps({
      calls: [],
      getCursor: async () => 20,
      fetchChanges: async () => ({ changes: [], head: 20 }),
      onStateChange: (state) => states.push(state),
    });
    const engine = new SyncEngine(deps);

    engine.onChange(change(21));
    await settle(1);
    expect(states).toEqual([]);

    engine.sync();
    await settle();
    expect(states).toEqual(['syncing', 'idle']);
  });

  /** 测试追平失败也回落 idle，横条不在失败后卡在正在同步 */
  it('should fall back to idle when catch-up fails', async () => {
    const states: string[] = [];
    const deps = makeDeps({
      calls: [],
      getCursor: async () => {
        throw new Error('db offline');
      },
      onStateChange: (state) => states.push(state),
    });
    const engine = new SyncEngine(deps);

    engine.sync();
    await settle(1);
    expect(states).toEqual(['syncing', 'idle']);
  });
});
