// @vitest-environment jsdom
/**
 * @file 陪伴舞台相位桥接的集成测试
 * 真实的 chatStore、settingsStore 与 performanceStore 同台上场，只替换网络与日志
 * ws 事件经 liveRun 推出相位推进引擎，思考气泡随之出入场，开关拨动、舞台卸载的归位与气泡地址拼 key 一并锁定
 */
import { StrictMode, createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  resolveTimelineIconUrl: (url?: string) => url,
  listPoses: vi.fn(),
  getPoseImageUrl: vi.fn(),
  getBackgroundImageUrl: vi.fn(),
}));

import { THINKING_BUBBLE, type AgentConfig } from '@persona/shared';
import { EFFECT_URLS } from '@/assets/effects';
import { CompanionContent } from '@/components/companion/CompanionContent';
import { useChatStore } from '@/stores/chatStore';
import { BUBBLE_FADE_MS, INITIAL_STATE } from '@/stores/performanceEngine';
import { usePerformanceStore } from '@/stores/performanceStore';
import { useSettingsStore } from '@/stores/settingsStore';

const SESSION = 'bridge-session';

/** 通过订阅恢复广播把会话切到生成态并设为当前会话 */
function startRun(): void {
  const store = useChatStore.getState();
  store.initSessionState(SESSION, []);
  store.setCurrentSessionId(SESSION);
  store.handleWsMessage({
    type: 'subscribed',
    sessionId: SESSION,
    isGenerating: true,
  });
}

/** 广播一条工具步开始 */
function startTool(): void {
  useChatStore.getState().handleWsMessage({
    type: 'tool_started',
    sessionId: SESSION,
    stepIndex: 0,
    toolName: 'read_file',
    paramSummary: '/a/b/app.ts',
  });
}

/** 广播一条带该工具调用的步骤完成，未闭合的工具步随之闭合 */
function finishStep(): void {
  useChatStore.getState().handleWsMessage({
    type: 'step_complete',
    sessionId: SESSION,
    stepIndex: 0,
    toolCalls: [
      { id: 'tc1', name: 'read_file', arguments: { path: '/a/b/app.ts' } },
    ],
    toolResults: [
      {
        toolCallId: 'tc1',
        toolName: 'read_file',
        result: 'body',
        success: true,
      },
    ],
  });
}

/** 广播回合结束，liveRun 随之清空 */
function finishRound(): void {
  useChatStore.getState().handleWsMessage({
    type: 'round_complete',
    sessionId: SESSION,
  });
}

/** 挂载陪伴舞台，agent 传 null 时舞台不渲染但桥接照常工作 */
function mountStage(agent: AgentConfig | null = null) {
  return render(createElement(CompanionContent, { agent }));
}

/** 推进假定时器，引擎的淡出定时器由此走到头 */
function elapse(ms: number): void {
  vi.advanceTimersByTime(ms);
}

const bubble = () => usePerformanceStore.getState().bubble;

describe('CompanionContent 相位桥接', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.getState().setThinkingBubbleEnabled(true);
  });

  afterEach(() => {
    // 引擎是模块级单例，卸载舞台会留下在途的淡出定时器，切回真实定时器前先把它跑完，不然句柄失效气泡层卡住
    cleanup();
    act(() => vi.runAllTimers());
    vi.useRealTimers();
  });

  it('会话进入生成态即挂上思考气泡，工具步让位，步落行回场，回合结束收起', () => {
    startRun();
    const view = mountStage();
    expect(bubble()).toMatchObject({ name: THINKING_BUBBLE, shown: true });

    act(() => startTool());
    expect(bubble()).toMatchObject({ name: THINKING_BUBBLE, shown: false });
    act(() => elapse(BUBBLE_FADE_MS));
    expect(bubble().name).toBeNull();

    act(() => finishStep());
    expect(bubble()).toMatchObject({ name: THINKING_BUBBLE, shown: true });

    act(() => finishRound());
    expect(bubble().shown).toBe(false);
    act(() => elapse(BUBBLE_FADE_MS));
    expect(bubble().name).toBeNull();
    view.unmount();
  });

  it('运行中关闭开关立即收起且不再回场，打开后按当前相位接上', () => {
    startRun();
    const view = mountStage();

    act(() => useSettingsStore.getState().setThinkingBubbleEnabled(false));
    expect(bubble().shown).toBe(false);
    act(() => {
      startTool();
      finishStep();
      elapse(BUBBLE_FADE_MS);
    });
    expect(bubble().name).toBeNull();

    act(() => useSettingsStore.getState().setThinkingBubbleEnabled(true));
    expect(bubble()).toMatchObject({ name: THINKING_BUBBLE, shown: true });
    view.unmount();
  });

  it('切换到空闲会话时思考气泡收起', () => {
    startRun();
    const view = mountStage();

    act(() => {
      useChatStore.getState().initSessionState('bridge-idle', []);
      useChatStore.getState().setCurrentSessionId('bridge-idle');
    });
    expect(bubble().shown).toBe(false);
    view.unmount();
  });

  it('舞台卸载时相位归空闲，思考气泡收起', () => {
    startRun();
    const view = mountStage();

    view.unmount();
    expect(bubble().shown).toBe(false);
    act(() => elapse(BUBBLE_FADE_MS));
    expect(bubble().name).toBeNull();
  });

  it('StrictMode 双挂载后思考气泡仍在场，节点不被卸载', () => {
    startRun();
    const view = render(
      createElement(
        StrictMode,
        null,
        createElement(CompanionContent, { agent: null })
      )
    );
    const key = bubble().key;

    act(() => elapse(BUBBLE_FADE_MS));
    expect(bubble()).toMatchObject({ name: THINKING_BUBBLE, shown: true });
    expect(bubble().key).toBe(key);
    view.unmount();
  });

  it('气泡图的地址拼上 key，同一张动态图每次出泡都是新的地址', () => {
    // 引擎是演出状态的唯一写入方，当前会话置空让挂载时不发生发布，注入的舞台状态才得以原样渲染
    useChatStore.getState().setCurrentSessionId(null);
    act(() => {
      usePerformanceStore.setState({
        ...INITIAL_STATE,
        layers: { a: 'persona-image://face', b: '' },
        shownPose: 'default',
        bubble: { name: 'sigh', shown: true, key: 4242 },
      });
    });
    const view = mountStage({
      bubbleOffsetX: 0,
      bubbleOffsetY: 0,
    } as AgentConfig);

    const src = view.container
      .querySelector('.perf-bubble img')
      ?.getAttribute('src');
    expect(src).toBe(`${EFFECT_URLS.sigh}?k=4242`);
    view.unmount();
  });
});
