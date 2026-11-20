/**
 * @fileoverview step_complete 表情切换的 chatStore 行为测试：
 * 全名广播命中后立绘立即切换，非表情工具不打扰当前表情
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

import { useChatStore } from '@/stores/chatStore';
import { useCompanionStore } from '@/stores/companionStore';

/** 通过订阅恢复广播把会话切到生成态 */
function enterLoading(sessionId: string): void {
  useChatStore.getState().handleWsMessage({
    type: 'subscribed',
    sessionId,
    isGenerating: true,
  });
}

describe('step_complete 表情切换', () => {
  it('全名 show_pose 成功执行后立绘立即切换', () => {
    const sessionId = 'pose-live';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

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

    expect(useCompanionStore.getState().currentPose).toBe('angry');
  });

  it('非表情工具的步骤不打扰当前表情', () => {
    const sessionId = 'pose-untouched';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);
    useCompanionStore.getState().setPose('happy');

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      toolCalls: [
        {
          id: 't2',
          name: 'built_in_terminal__bash',
          arguments: { command: 'ls' },
        },
      ],
      toolResults: [
        { toolCallId: 't2', toolName: 'bash', result: '', success: true },
      ],
    });

    expect(useCompanionStore.getState().currentPose).toBe('happy');
  });
});
