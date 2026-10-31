/**
 * @file 运行族事件的 Agent 归属集合测试
 * run_started 登记归属、run_ended 收敛与 runs_snapshot 整体替换在此锁定，头像运行圈吃这里的集合
 */
import { describe, expect, it, vi } from 'vitest';

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
  getSession: vi.fn(),
  WebSocketClient: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

import { useChatStore } from '@/stores/chatStore';

/** 每例前清空运行三件套，避免 zustand 单例状态串例 */
const resetRunning = () =>
  useChatStore.setState({
    runningOwners: new Map(),
    runningSessions: [],
    runningAgents: [],
  });

const runStarted = (sessionId: string, agentId: string) =>
  useChatStore.getState().handleWsMessage({
    type: 'run_started',
    sessionId,
    agentId,
  });

const runEnded = (sessionId: string, agentId: string) =>
  useChatStore.getState().handleWsMessage({
    type: 'run_ended',
    sessionId,
    agentId,
  });

describe('运行族归属集合', () => {
  it('run_started 同时点亮会话与 Agent 集合', () => {
    resetRunning();
    runStarted('s1', 'a1');
    const s = useChatStore.getState();
    expect(s.runningSessions).toEqual(['s1']);
    expect(s.runningAgents).toEqual(['a1']);
  });

  it('广播重放不产生重复成员', () => {
    resetRunning();
    runStarted('s1', 'a1');
    runStarted('s1', 'a1');
    const s = useChatStore.getState();
    expect(s.runningSessions).toEqual(['s1']);
    expect(s.runningAgents).toEqual(['a1']);
  });

  it('同 Agent 双会话去重，全部结束才移除', () => {
    resetRunning();
    runStarted('s1', 'a1');
    runStarted('s2', 'a1');
    expect(useChatStore.getState().runningSessions).toEqual(['s1', 's2']);
    expect(useChatStore.getState().runningAgents).toEqual(['a1']);
    runEnded('s1', 'a1');
    expect(useChatStore.getState().runningSessions).toEqual(['s2']);
    expect(useChatStore.getState().runningAgents).toEqual(['a1']);
    runEnded('s2', 'a1');
    expect(useChatStore.getState().runningSessions).toEqual([]);
    expect(useChatStore.getState().runningAgents).toEqual([]);
  });

  it('runs_snapshot 整体替换两个集合', () => {
    resetRunning();
    runStarted('s1', 'a1');
    useChatStore.getState().handleWsMessage({
      type: 'runs_snapshot',
      sessionIds: ['s9'],
      runs: [{ sessionId: 's9', agentId: 'a9' }],
    });
    const s = useChatStore.getState();
    expect(s.runningSessions).toEqual(['s9']);
    expect(s.runningAgents).toEqual(['a9']);
  });
});
