/**
 * @file 顶栏时间线的纯函数与 store 事件测试
 * buildRows 的行推导口径、idleLabel 的成败两态、liveRun 缓冲的事件推进与轮末清空在此锁定
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/api', () => ({
  createMessage: (
    type: 'user' | 'assistant' | 'error',
    content: string,
    extra: Record<string, unknown> = {},
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
import {
  buildRows,
  idleLabel,
  type Translate,
} from '@/components/chat/LiveStrip';
import type { UIMessage, Thought } from '@/types/chat';

/** 测试用文案表，插值按 i18n 的 {{name}} 形态替换 */
const dict: Record<string, string> = {
  'live.thinking': '思考中',
  'live.done': '执行了 {{count}} 个步骤',
  'live.doneFail': '执行了 {{count}} 个步骤 · {{fails}} 步失败',
};
const t: Translate = (key, opts) =>
  Object.entries(opts ?? {}).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)),
    dict[key] ?? key,
  );

/** 便捷构造一条思考步骤 */
const thought = (partial: Partial<Thought>): Thought => ({
  id: crypto.randomUUID(),
  type: 'tool_use',
  timestamp: new Date(),
  ...partial,
});

/** 便捷构造一条消息 */
const message = (partial: Partial<UIMessage> & { type: UIMessage['type'] }): UIMessage => ({
  id: crypto.randomUUID(),
  content: '',
  timestamp: new Date(),
  ...partial,
});

/** 通过订阅恢复广播把会话切到生成态 */
function enterLoading(sessionId: string): void {
  useChatStore.getState().initSessionState(sessionId, []);
  useChatStore.getState().handleWsMessage({
    type: 'subscribed',
    sessionId,
    isGenerating: true,
  });
}

/** 广播一条带单工具调用的步骤完成 */
function broadcastStep(sessionId: string): void {
  useChatStore.getState().handleWsMessage({
    type: 'step_complete',
    sessionId,
    stepIndex: 0,
    thinking: '先查文件',
    toolCalls: [{ id: 'tc1', name: 'read_file', arguments: { path: '/a/b/app.ts' } }],
    toolResults: [
      { toolCallId: 'tc1', toolName: 'read_file', result: 'file body', success: true },
    ],
  });
}

describe('liveRun 缓冲的事件推进', () => {
  it('run_started 为已加载会话建空时间线', () => {
    const sessionId = 'live-run-started';
    useChatStore.getState().initSessionState(sessionId, []);
    useChatStore.getState().handleWsMessage({ type: 'run_started', sessionId });
    expect(
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun,
    ).toEqual({ steps: [] });
  });

  it('subscribed 恢复生成态时建空时间线', () => {
    const sessionId = 'live-subscribed';
    enterLoading(sessionId);
    const state = useChatStore.getState().sessionStates.get(sessionId);
    expect(state?.isLoading).toBe(true);
    expect(state?.liveRun).toEqual({ steps: [] });
  });

  it('step_complete 推进思考步与工具步且即时闭合', () => {
    const sessionId = 'live-step';
    enterLoading(sessionId);
    broadcastStep(sessionId);
    const steps =
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun?.steps ?? [];
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      tool: '',
      detail: '先查文件',
      endedAt: expect.any(Number),
    });
    expect(steps[1]).toMatchObject({
      tool: 'read_file',
      detail: '/a/b/app.ts',
      input: '{"path":"/a/b/app.ts"}',
      output: 'file body',
      endedAt: expect.any(Number),
    });
    expect(steps[1]?.failed).toBeUndefined();
  });

  it('turn_complete 组装气泡并清空时间线', () => {
    const sessionId = 'live-turn';
    enterLoading(sessionId);
    broadcastStep(sessionId);
    useChatStore.getState().handleWsMessage({
      type: 'turn_complete',
      sessionId,
    });
    const state = useChatStore.getState().sessionStates.get(sessionId);
    expect(state?.liveRun).toBeNull();
    expect(state?.messages.at(-1)?.type).toBe('assistant');
    expect(state?.messages.at(-1)?.thoughts).toHaveLength(2);
  });

  it('round_complete 与 error 与 aborted 轮末统一清空时间线', () => {
    for (const [sessionId, end] of [
      ['live-round', 'round_complete'],
      ['live-error', 'error'],
      ['live-abort', 'aborted'],
    ] as const) {
      enterLoading(sessionId);
      broadcastStep(sessionId);
      useChatStore.getState().handleWsMessage(
        end === 'error'
          ? { type: 'error', sessionId, message: 'boom' }
          : end === 'aborted'
            ? { type: 'aborted', sessionId, reason: 'user_cancel' }
            : { type: 'round_complete', sessionId },
      );
      expect(
        useChatStore.getState().sessionStates.get(sessionId)?.liveRun,
      ).toBeNull();
    }
  });

  it('插话续跑在 turn_complete 清空后由下一条 step_complete 重建时间线', () => {
    const sessionId = 'live-continue';
    enterLoading(sessionId);
    broadcastStep(sessionId);
    useChatStore.getState().handleWsMessage({
      type: 'turn_complete',
      sessionId,
    });
    expect(
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun,
    ).toBeNull();
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 1,
      thinking: '继续处理插话',
    });
    const steps =
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun?.steps ?? [];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ tool: '', detail: '继续处理插话' });
  });
});

describe('buildRows 行推导', () => {
  const messages: UIMessage[] = [
    message({ type: 'user', content: '帮我查一下' }),
    message({
      type: 'assistant',
      content: '查完了',
      thoughts: [
        thought({ type: 'thinking', content: '先看目录' }),
        thought({ type: 'text', content: '查完了' }),
        thought({
          toolName: 'bash',
          toolInput: { command: 'ls -la' },
          toolResult: { output: 'a b c', isError: false },
        }),
      ],
    }),
  ];

  it('从消息流摊平三类行且 text 步骤过滤', () => {
    const rows = buildRows(messages, null);
    expect(rows.map((r) => r.kind)).toEqual(['user', 'think', 'tool']);
    expect(rows[2]).toMatchObject({
      tool: 'bash',
      detail: 'ls -la',
      input: '{"command":"ls -la"}',
      output: 'a b c',
    });
  });

  it('失败判定读 isError 与 toolResult 的 isError', () => {
    const failed = buildRows(
      [
        message({
          type: 'assistant',
          thoughts: [
            thought({
              toolName: 'bash',
              toolInput: { command: 'boom' },
              toolResult: { output: 'Error: x', isError: true },
            }),
          ],
        }),
      ],
      null,
    );
    expect(failed[0]).toMatchObject({ kind: 'tool', failed: true });
  });

  it('liveRun 步骤作活动尾巴且思考间隙补思考中行', () => {
    const rows = buildRows([], { steps: [{ tool: '', detail: '想着', startedAt: 1, endedAt: 1 }] });
    // 步骤全闭合，处于思考间隙，末尾补一条活动思考行
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'think', live: false });
    expect(rows[1]).toMatchObject({ kind: 'think', live: true, synthetic: true });

    const withActiveTool = buildRows([], {
      steps: [
        { tool: 'bash', detail: 'npm test', startedAt: 1, input: '{"command":"npm test"}' },
      ],
    });
    expect(withActiveTool).toHaveLength(1);
    expect(withActiveTool[0]).toMatchObject({ kind: 'tool', live: true });
  });
});

describe('tool_started 与相位恢复', () => {
  it('tool_started 开活动步且不闭合，空闲时丢弃', () => {
    const sessionId = 'live-tool-open';
    enterLoading(sessionId);
    useChatStore.getState().handleWsMessage({
      type: 'tool_started',
      sessionId,
      stepIndex: 0,
      toolName: 'bash',
      paramSummary: 'npm test',
    });
    const steps =
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun?.steps ??
      [];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ tool: 'bash', detail: 'npm test' });
    expect(steps[0]?.endedAt).toBeUndefined();

    const idleId = 'live-tool-idle';
    useChatStore.getState().initSessionState(idleId, []);
    useChatStore.getState().handleWsMessage({
      type: 'tool_started',
      sessionId: idleId,
      stepIndex: 0,
      toolName: 'bash',
      paramSummary: 'npm test',
    });
    expect(
      useChatStore.getState().sessionStates.get(idleId)?.liveRun,
    ).toBeNull();
  });

  it('step_complete 按序闭合并补全失败态与输入输出，思考段插在工具步之前', () => {
    const sessionId = 'live-tool-close';
    enterLoading(sessionId);
    useChatStore.getState().handleWsMessage({
      type: 'tool_started',
      sessionId,
      stepIndex: 0,
      toolName: 'read_file',
      paramSummary: '/a/b/app.ts',
    });
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      thinking: '先读文件',
      toolCalls: [
        {
          id: 'tc1',
          name: 'read_file',
          arguments: { path: '/a/b/app.ts' },
        },
      ],
      toolResults: [
        {
          toolCallId: 'tc1',
          toolName: 'read_file',
          result: 'Error: missing',
          success: false,
        },
      ],
    });
    const state = useChatStore.getState().sessionStates.get(sessionId);
    const steps = state?.liveRun?.steps ?? [];
    // 思考段插在工具步之前还原叙述顺序，工具步闭合并带失败态
    expect(steps.map((s) => s.tool)).toEqual(['', 'read_file']);
    expect(steps[0]).toMatchObject({ detail: '先读文件' });
    expect(steps[1]).toMatchObject({
      input: '{"path":"/a/b/app.ts"}',
      output: 'Error: missing',
      failed: true,
      endedAt: expect.any(Number),
    });
    // 气泡缓冲不受时间线影响
    expect(state?.pendingThoughts).toHaveLength(2);
  });

  it('tool_started 漏收时 step_complete 兜底补已完成步', () => {
    const sessionId = 'live-tool-missed';
    enterLoading(sessionId);
    useChatStore.getState().handleWsMessage({
      type: 'step_complete',
      sessionId,
      stepIndex: 0,
      toolCalls: [
        { id: 'tc1', name: 'bash', arguments: { command: 'ls' } },
      ],
      toolResults: [
        { toolCallId: 'tc1', toolName: 'bash', result: 'a b', success: true },
      ],
    });
    const steps =
      useChatStore.getState().sessionStates.get(sessionId)?.liveRun?.steps ??
      [];
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      tool: 'bash',
      detail: 'ls',
      endedAt: expect.any(Number),
    });
  });

  it('subscribed 带 currentActivity 两态恢复', () => {
    const toolId = 'live-restore-tool';
    useChatStore.getState().initSessionState(toolId, []);
    useChatStore.getState().handleWsMessage({
      type: 'subscribed',
      sessionId: toolId,
      isGenerating: true,
      currentActivity: {
        kind: 'tool',
        stepIndex: 1,
        toolName: 'bash',
        paramSummary: 'npm run dev',
      },
    });
    const toolSteps =
      useChatStore.getState().sessionStates.get(toolId)?.liveRun?.steps ?? [];
    expect(toolSteps).toHaveLength(1);
    expect(toolSteps[0]).toMatchObject({
      tool: 'bash',
      detail: 'npm run dev',
    });
    expect(toolSteps[0]?.endedAt).toBeUndefined();

    const thinkId = 'live-restore-think';
    useChatStore.getState().initSessionState(thinkId, []);
    useChatStore.getState().handleWsMessage({
      type: 'subscribed',
      sessionId: thinkId,
      isGenerating: true,
      currentActivity: { kind: 'thinking' },
    });
    expect(
      useChatStore.getState().sessionStates.get(thinkId)?.liveRun,
    ).toEqual({ steps: [] });
  });
});

describe('idleLabel 空闲摘要', () => {
  it('成功轮输出步数，失败轮输出红字整句', () => {
    const ok = message({
      type: 'assistant',
      thoughts: [
        thought({ toolName: 'bash', toolInput: { command: 'ls' } }),
        thought({ toolName: 'bash', toolInput: { command: 'pwd' } }),
      ],
    });
    expect(idleLabel(t, [ok])).toEqual({
      text: '执行了 2 个步骤',
      failed: false,
    });

    const bad = message({
      type: 'assistant',
      thoughts: [
        thought({ toolName: 'bash', toolInput: { command: 'ls' } }),
        thought({
          toolName: 'bash',
          toolInput: { command: 'boom' },
          toolResult: { output: 'Error', isError: true },
        }),
      ],
    });
    expect(idleLabel(t, [bad])).toEqual({
      text: '执行了 2 个步骤 · 1 步失败',
      failed: true,
    });
  });

  it('回退不到工具步数时取最后一条用户消息截断', () => {
    const long = 'a'.repeat(40);
    expect(idleLabel(t, [message({ type: 'user', content: long })])).toEqual({
      text: `${'a'.repeat(23)}…`,
      failed: false,
    });
    expect(idleLabel(t, [])).toEqual({ text: '思考中', failed: false });
  });

  it('只认最后一条带工具步的 assistant 消息', () => {
    const earlier = message({
      type: 'assistant',
      thoughts: [thought({ toolName: 'bash', toolInput: { command: 'ls' } })],
    });
    const user = message({ type: 'user', content: '再来一轮' });
    expect(idleLabel(t, [earlier, user])).toEqual({
      text: '执行了 1 个步骤',
      failed: false,
    });
  });
});
