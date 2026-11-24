/**
 * @fileoverview pose_changed 事件的 chatStore 分发测试：
 * 当前会话的演出请求原样转交 performanceStore，非当前会话的请求丢弃，step_complete 不再触发换脸
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  resolveTimelineIconUrl: (u?: string) => u,
}));

const { perform } = vi.hoisted(() => ({ perform: vi.fn() }));

vi.mock('@/stores/performanceStore', () => ({
  usePerformanceStore: { getState: () => ({ perform }) },
}));

import { useChatStore } from '@/stores/chatStore';

describe('pose_changed 演出分发', () => {
  beforeEach(() => {
    perform.mockClear();
  });

  it('当前会话的 pose_changed 原样转交三参数', () => {
    const sessionId = 'pose-live';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setCurrentSessionId(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'pose_changed',
      sessionId,
      pose: 'angry',
      motion: 'angry-stomp',
      bubble: 'angry',
    });

    expect(perform).toHaveBeenCalledTimes(1);
    expect(perform).toHaveBeenCalledWith({
      pose: 'angry',
      motion: 'angry-stomp',
      bubble: 'angry',
    });
  });

  it('非当前会话的 pose_changed 丢弃不上台', () => {
    useChatStore.getState().setCurrentSessionId('pose-live');
    useChatStore.getState().initSessionState('pose-background', []);

    useChatStore.getState().handleWsMessage({
      type: 'pose_changed',
      sessionId: 'pose-background',
      pose: 'sad',
    });

    expect(perform).not.toHaveBeenCalled();
  });

  it('step_complete 里的 show_pose 不再触发换脸，切脸只走 pose_changed 单轨', () => {
    const sessionId = 'pose-step';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setCurrentSessionId(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      toolCalls: [
        {
          id: 't1',
          name: 'built_in_pose__show_pose',
          arguments: { pose: 'angry' },
        },
      ],
      toolResults: [
        { toolCallId: 't1', toolName: 'pose', result: '', success: true },
      ],
    });

    expect(perform).not.toHaveBeenCalled();
  });
});
