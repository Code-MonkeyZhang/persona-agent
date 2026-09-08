/**
 * @fileoverview 忙时插话的 chatStore 行为测试：灰气泡同步与忙时发送分支
 */

import { describe, it, expect, vi } from 'vitest';
import type { PendingInput } from '@persona/shared';

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
import { sendChatMessage } from '@/lib/api';

/** 广播一条待注入缓冲变化 */
function broadcastPending(sessionId: string, pending: PendingInput[]): void {
  useChatStore
    .getState()
    .handleWsMessage({ type: 'pending_input_changed', sessionId, pending });
}

describe('pending_input_changed 同步', () => {
  it('服务端新增条目时补一条灰气泡，App 来源携带来源名', () => {
    const sessionId = 'sync-add';
    useChatStore.getState().initSessionState(sessionId, []);

    broadcastPending(sessionId, [
      { id: 'p1', source: 'user', content: '插话内容' },
      { id: 'p2', source: 'app', sourceName: '番茄钟', content: '完成' },
    ]);

    const messages = useChatStore
      .getState()
      .sessionStates.get(sessionId)!.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      queued: true,
      pendingId: 'p1',
      content: '插话内容',
    });
    expect(messages[1]).toMatchObject({
      source: 'app',
      sourceName: '番茄钟',
    });
  });

  it('缓冲取空的广播把灰气泡转正常渲染', () => {
    const sessionId = 'sync-drain';
    useChatStore.getState().initSessionState(sessionId, []);

    broadcastPending(sessionId, [{ id: 'p1', source: 'user', content: 'x' }]);
    broadcastPending(sessionId, []);

    const messages = useChatStore
      .getState()
      .sessionStates.get(sessionId)!.messages;
    expect(messages[0]!.queued).toBe(false);
  });
});

describe('忙时插话发送', () => {
  it('生成中发送不提前上屏，灰气泡由广播渲染并携带 pendingId', async () => {
    const sessionId = 'busy-send';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setCurrentSessionId(sessionId);
    useChatStore.getState().setAgentId('agent-1');
    useChatStore.getState().setConnectionStatus('connected');
    // 通过订阅恢复广播把会话切到生成态，无助手占位气泡，流式句柄为空
    useChatStore.getState().handleWsMessage({
      type: 'subscribed',
      sessionId,
      isGenerating: true,
    });
    const busyState = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(busyState.isLoading).toBe(true);
    expect(busyState.streamingMessageId).toBeNull();

    vi.mocked(sendChatMessage).mockResolvedValue({
      success: true,
      pendingId: 'srv-1',
    });

    await useChatStore.getState().sendMessage('忙时消息', sessionId);

    // 发送本身不上屏，灰气泡等待广播渲染
    let state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.messages.filter((m) => m.type === 'user')).toHaveLength(0);

    broadcastPending(sessionId, [
      { id: 'srv-1', source: 'user', content: '忙时消息' },
    ]);

    state = useChatStore.getState().sessionStates.get(sessionId)!;
    const queuedBubble = state.messages.find((m) => m.type === 'user');
    expect(queuedBubble).toMatchObject({
      content: '忙时消息',
      queued: true,
      pendingId: 'srv-1',
    });
    // 流式状态不被插话分支触碰
    expect(state.isLoading).toBe(true);
    expect(state.streamingMessageId).toBeNull();
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('发送失败时不上屏也无需回滚，生成态不动', async () => {
    const sessionId = 'busy-fail';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setCurrentSessionId(sessionId);
    useChatStore.getState().setAgentId('agent-1');
    useChatStore.getState().setConnectionStatus('connected');
    useChatStore.getState().handleWsMessage({
      type: 'subscribed',
      sessionId,
      isGenerating: true,
    });

    vi.mocked(sendChatMessage).mockRejectedValue(new Error('network'));

    await useChatStore.getState().sendMessage('会失败', sessionId);

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.messages.filter((m) => m.type === 'user')).toHaveLength(0);
    expect(state.isLoading).toBe(true);
  });
});

describe('轮次边界信号', () => {
  it('round_complete 后下一轮 step_complete 开新气泡，前轮内容不被覆盖', () => {
    const sessionId = 'round-end';
    useChatStore.getState().initSessionState(sessionId, []);
    // 通过订阅恢复广播把会话切到生成态
    useChatStore.getState().handleWsMessage({
      type: 'subscribed',
      sessionId,
      isGenerating: true,
    });

    // 第1轮首条步骤完成创建气泡A
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      content: '第一轮回复',
    });
    let state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.messages.filter((m) => m.type === 'assistant')).toHaveLength(
      1
    );
    expect(state.streamingMessageId).not.toBeNull();

    // 轮次边界只清流式标记，生成状态与消息不动
    useChatStore
      .getState()
      .handleWsMessage({ type: 'round_complete', sessionId });
    state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.streamingMessageId).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.messages.filter((m) => m.type === 'assistant')).toHaveLength(
      1
    );

    // 第2轮首条步骤完成开新气泡B，A 的内容不被覆盖
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      content: '第二轮回复',
    });
    state = useChatStore.getState().sessionStates.get(sessionId)!;
    const replies = state.messages
      .filter((m) => m.type === 'assistant')
      .map((m) => m.content);
    expect(replies).toEqual(['第一轮回复', '第二轮回复']);
    expect(state.isLoading).toBe(true);
  });
});
