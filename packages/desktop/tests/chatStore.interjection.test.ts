/**
 * @fileoverview 忙时插话的 chatStore 行为测试：灰气泡同步、忙时发送分支与轮次缓冲组装
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
import { sendChatMessage, getSession } from '@/lib/api';

/** 广播一条待注入缓冲变化 */
function broadcastPending(sessionId: string, pending: PendingInput[]): void {
  useChatStore
    .getState()
    .handleWsMessage({ type: 'pending_input_changed', sessionId, pending });
}

/** 通过订阅恢复广播把会话切到生成态 */
function enterLoading(sessionId: string): void {
  useChatStore.getState().handleWsMessage({
    type: 'subscribed',
    sessionId,
    isGenerating: true,
  });
}

describe('pending_input_changed 同步', () => {
  it('服务端新增条目时补一条灰气泡，App 来源不补', () => {
    const sessionId = 'sync-add';
    useChatStore.getState().initSessionState(sessionId, []);

    broadcastPending(sessionId, [
      { id: 'p1', source: 'user', content: '插话内容' },
      { id: 'p2', source: 'app', sourceName: '番茄钟', content: '完成' },
    ]);

    const messages = useChatStore
      .getState()
      .sessionStates.get(sessionId)!.messages;
    // App 来源的通知不在聊天窗口显示
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      queued: true,
      pendingId: 'p1',
      content: '插话内容',
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
    // 通过订阅恢复广播把会话切到生成态，无助手占位气泡，轮次缓冲为空
    enterLoading(sessionId);
    const busyState = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(busyState.isLoading).toBe(true);
    expect(busyState.messages).toHaveLength(0);

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
    // 生成态与轮次缓冲不被插话分支触碰
    expect(state.isLoading).toBe(true);
    expect(state.messages.filter((m) => m.type === 'assistant')).toHaveLength(
      0
    );
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('发送失败时不上屏也无需回滚，生成态不动', async () => {
    const sessionId = 'busy-fail';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setCurrentSessionId(sessionId);
    useChatStore.getState().setAgentId('agent-1');
    useChatStore.getState().setConnectionStatus('connected');
    enterLoading(sessionId);

    vi.mocked(sendChatMessage).mockRejectedValue(new Error('network'));

    await useChatStore.getState().sendMessage('会失败', sessionId);

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.messages.filter((m) => m.type === 'user')).toHaveLength(0);
    expect(state.isLoading).toBe(true);
  });
});

describe('轮次缓冲组装', () => {
  it('步骤事件只进缓冲，生成期间界面无助手气泡', () => {
    const sessionId = 'buffer-only';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      thinking: '思考',
      content: '回复',
    });

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.messages.filter((m) => m.type === 'assistant')).toHaveLength(
      0
    );
    expect(state.pendingThoughts).toHaveLength(2);
    expect(state.pendingContent).toBe('回复');
  });

  it('turn_complete 把缓冲组装成一条气泡，text thought 转正为回复', () => {
    const sessionId = 'assemble';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      thinking: '思考',
      content: '回复正文',
    });
    useChatStore
      .getState()
      .handleWsMessage({ type: 'turn_complete', sessionId });

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    const replies = state.messages.filter((m) => m.type === 'assistant');
    expect(replies).toHaveLength(1);
    expect(replies[0]!.content).toBe('回复正文');
    // 正文已从时间线移除，只留思考
    expect(replies[0]!.thoughts?.map((t) => t.type)).toEqual(['thinking']);
    // 缓冲复位，生成状态保持
    expect(state.pendingThoughts).toHaveLength(0);
    expect(state.pendingContent).toBe('');
    expect(state.isLoading).toBe(true);
  });

  it('双轮各组装一条气泡，插话灰气泡排在两轮回复之上', () => {
    const sessionId = 'two-rounds';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

    // 轮1步骤进行中用户插话，灰气泡先上屏
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      content: '第一轮回复',
    });
    broadcastPending(sessionId, [
      { id: 'q1', source: 'user', content: '插话内容' },
    ]);
    useChatStore
      .getState()
      .handleWsMessage({ type: 'turn_complete', sessionId });

    // 轮2消费插话，另组装一条气泡
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      content: '第二轮回复',
    });
    useChatStore
      .getState()
      .handleWsMessage({ type: 'turn_complete', sessionId });
    useChatStore
      .getState()
      .handleWsMessage({ type: 'round_complete', sessionId });

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(
      state.messages.map((m) => `${m.type}:${m.content}`)
    ).toEqual([
      'user:插话内容',
      'assistant:第一轮回复',
      'assistant:第二轮回复',
    ]);
    expect(state.isLoading).toBe(false);
  });

  it('aborted 把缓冲冲刷成带中止标记的半截气泡', () => {
    const sessionId = 'abort-flush';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      thinking: '思考',
    });
    useChatStore.getState().handleWsMessage({
      type: 'aborted',
      sessionId,
      reason: 'user_cancel',
    });

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    const replies = state.messages.filter((m) => m.type === 'assistant');
    expect(replies).toHaveLength(1);
    expect(replies[0]!.aborted).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.pendingThoughts).toHaveLength(0);
  });

  it('error 先冲刷半截气泡再落错误气泡', () => {
    const sessionId = 'error-flush';
    useChatStore.getState().initSessionState(sessionId, []);
    enterLoading(sessionId);

    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      thinking: '思考',
    });
    useChatStore.getState().handleWsMessage({
      type: 'error',
      sessionId,
      message: 'API 调用失败',
    });

    const state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(
      state.messages.map((m) => `${m.type}:${m.content}`)
    ).toEqual(['assistant:', 'error:API 调用失败']);
    expect(state.isLoading).toBe(false);
  });

  it('空缓冲的 turn_complete 武装刷新标志，round_complete 后从磁盘整包刷新', async () => {
    const sessionId = 'armed-refresh';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().setAgentId('agent-1');
    enterLoading(sessionId);

    // 重载后错过步骤事件，缓冲为空
    useChatStore
      .getState()
      .handleWsMessage({ type: 'turn_complete', sessionId });
    let state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.armedDiskRefresh).toBe(true);
    expect(state.messages).toHaveLength(0);

    vi.mocked(getSession).mockResolvedValue({
      id: sessionId,
      agentId: 'agent-1',
      title: '测试会话',
      createdAt: 0,
      updatedAt: 0,
      model: { provider: 'openai', model: 'gpt-4' },
      messages: [],
    });
    useChatStore
      .getState()
      .handleWsMessage({ type: 'round_complete', sessionId });

    state = useChatStore.getState().sessionStates.get(sessionId)!;
    expect(state.isLoading).toBe(false);
    expect(state.armedDiskRefresh).toBe(false);
    expect(getSession).toHaveBeenCalledWith('agent-1', sessionId);
  });
});
