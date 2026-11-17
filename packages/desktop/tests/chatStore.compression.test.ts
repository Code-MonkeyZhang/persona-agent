/**
 * @fileoverview 压缩事件族的 chatStore 行为测试：占用快照、运行态相位机与记录同步
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  createMessage: (
    type: 'user' | 'assistant' | 'error',
    content: string,
    extra: Record<string, unknown> = {}
  ) => ({
    id: crypto.randomUUID(),
    type,
    content,
    timestamp: new Date(),
    ...extra,
  }),
  sendChatMessage: vi.fn(),
  triggerCompression: vi.fn(),
  getSession: vi.fn(),
  WebSocketClient: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  resolveTimelineIconUrl: (iconUrl: string | undefined) => iconUrl,
  listSessions: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

import { useChatStore } from '@/stores/chatStore';

describe('context_usage 快照', () => {
  it('报数落账写快照，空闲会话照常受理不受 isLoading 守卫', () => {
    const sessionId = 'usage-write';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'context_usage',
      sessionId,
      used: 79400,
      window: 128000,
      shares: { messages: 60000, systemPersona: 12000, toolsSkills: 7400 },
      source: 'model',
    });
    expect(
      useChatStore.getState().usageSnapshots.get(sessionId)
    ).toEqual({
      used: 79400,
      window: 128000,
      shares: { messages: 60000, systemPersona: 12000, toolsSkills: 7400 },
    });
  });
});

describe('压缩运行态相位机', () => {
  it('started 首发置 running，attempt 递增转 retry 并清空上一轮落定', () => {
    const sessionId = 'comp-phase';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-1',
      attempt: 1,
      before: 90000,
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ recordId: 'rec-1', phase: 'running', attempt: 1 });

    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-1',
      attempt: 2,
      before: 90000,
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ recordId: 'rec-1', phase: 'retry', attempt: 2 });
  });

  it('complete 置 idle 记落定对比，failed 置 failed 带失败回执时间戳，新一轮 started 清空', () => {
    const sessionId = 'comp-end';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-2',
      attempt: 1,
      before: 90000,
    });
    useChatStore.getState().handleWsMessage({
      type: 'compression_complete',
      sessionId,
      recordId: 'rec-2',
      before: 90000,
      after: 30000,
      trigger: 'manual',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({
      phase: 'idle',
      lastLanded: { before: 90000, after: 30000 },
      failReason: null,
    });

    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-3',
      attempt: 1,
      before: 90000,
    });
    useChatStore.getState().handleWsMessage({
      type: 'compression_failed',
      sessionId,
      recordId: 'rec-3',
      reason: 'provider',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({
      phase: 'failed',
      lastLanded: null,
      failReason: 'provider',
      failedAt: expect.any(Number),
    });

    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-4',
      attempt: 1,
      before: 90000,
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ phase: 'running', failReason: null, failedAt: null });
  });

  it('recordId 对不上的陈旧终态事件不覆盖新一轮状态', () => {
    const sessionId = 'comp-stale';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-new',
      attempt: 1,
      before: null,
    });
    useChatStore.getState().handleWsMessage({
      type: 'compression_complete',
      sessionId,
      recordId: 'rec-old',
      before: 100,
      after: 50,
      trigger: 'auto',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ recordId: 'rec-new', phase: 'running' });
  });

  it('无 started 领路的连发失败各带新编号照常受理，进行中的陌生编号失败仍被拦', () => {
    const sessionId = 'comp-nomat';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'compression_failed',
      sessionId,
      recordId: 'no-1',
      reason: 'no_material',
    });
    const first = useChatStore.getState().compressionStates.get(sessionId);
    expect(first).toMatchObject({
      phase: 'failed',
      failReason: 'no_material',
      failedAt: expect.any(Number),
    });

    useChatStore.getState().handleWsMessage({
      type: 'compression_failed',
      sessionId,
      recordId: 'no-2',
      reason: 'no_material',
    });
    const second = useChatStore.getState().compressionStates.get(sessionId);
    expect(second).toMatchObject({ phase: 'failed', recordId: 'no-2' });
    expect(second?.failedAt).toBeGreaterThanOrEqual(first?.failedAt ?? 0);

    useChatStore.getState().handleWsMessage({
      type: 'compression_started',
      sessionId,
      recordId: 'rec-run',
      attempt: 1,
      before: 90000,
    });
    useChatStore.getState().handleWsMessage({
      type: 'compression_failed',
      sessionId,
      recordId: 'no-2',
      reason: 'provider',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ recordId: 'rec-run', phase: 'running' });
  });

  it('run_started 吊销落定显示与失败记忆，让位后不复活', () => {
    const sessionId = 'comp-retire';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({
      type: 'compression_complete',
      sessionId,
      recordId: 'rec-4',
      before: 90000,
      after: 30000,
      trigger: 'auto',
    });
    useChatStore.getState().handleWsMessage({
      type: 'run_started',
      sessionId,
      agentId: 'agent-1',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)?.lastLanded
    ).toBeNull();

    useChatStore.getState().handleWsMessage({
      type: 'compression_failed',
      sessionId,
      recordId: 'rec-5',
      reason: 'provider',
    });
    useChatStore.getState().handleWsMessage({
      type: 'run_started',
      sessionId,
      agentId: 'agent-1',
    });
    expect(
      useChatStore.getState().compressionStates.get(sessionId)
    ).toMatchObject({ phase: 'idle', failReason: null, lastLanded: null });
  });
});

describe('压缩记录同步', () => {
  it('initSessionState 带入的记录按发生时间升序，重复初始化不残留', () => {
    const sessionId = 'comp-log';
    useChatStore.getState().initSessionState(sessionId, [], [
      { id: 'b', state: 'complete', trigger: 'manual', attempt: 1, before: 1, after: 1, at: 200 },
      { id: 'a', state: 'complete', trigger: 'manual', attempt: 1, before: 1, after: 1, at: 100 },
    ]);
    expect(
      useChatStore.getState().compressionLogs.get(sessionId)?.map((r) => r.id)
    ).toEqual(['a', 'b']);

    useChatStore.getState().initSessionState(sessionId, [], [
      { id: 'a', state: 'complete', trigger: 'manual', attempt: 1, before: 1, after: 1, at: 100 },
    ]);
    expect(
      useChatStore.getState().compressionLogs.get(sessionId)?.map((r) => r.id)
    ).toEqual(['a']);
  });
});
