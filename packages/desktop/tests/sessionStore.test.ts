import { describe, it, expect, vi } from 'vitest';
import { useSessionStore } from '@/stores/sessionStore';
import type { Message } from '@persona/shared';

vi.mock('@/lib/api', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

/** 轮次边界条目，模拟会话接口混入后的客户端视角 */
const boundary: Message = { role: 'system', content: '', turnEnd: true };

/** 工具步，携带思考与单个工具调用 */
function toolStep(name: string): Message {
  return {
    role: 'assistant',
    thinking: `思考 ${name}`,
    tool_calls: [
      {
        id: `call-${name}`,
        type: 'function',
        function: { name, arguments: {} },
        toolResult: { content: 'ok', isError: false },
      },
    ],
  };
}

/** 收尾步，不带 tool_calls 的最终回答 */
function finalStep(content: string): Message {
  return { role: 'assistant', content };
}

describe('sessionStore convertSessionMessages', () => {
  it('filters out context messages while keeping user/assistant', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
      {
        role: 'context',
        source: 'runtime-context',
        content: '[system] 当前时间：2026-08-18 星期二 10:30 (UTC+8)',
      },
      { role: 'assistant', content: 'hello' },
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('user');
    expect(out[0]?.content).toBe('hi');
    expect(out[1]?.type).toBe('assistant');
    expect(out[1]?.content).toBe('hello');
  });

  it('returns empty array for context-only history', () => {
    const messages: Message[] = [
      { role: 'context', source: 'runtime-context', content: 'x' },
      { role: 'system', content: 'y' },
    ];

    expect(useSessionStore.getState().convertSessionMessages(messages)).toEqual(
      []
    );
  });

  /** 天气剧本：插话在轮内注入，回复气泡排到插话之下，双轮各一泡 */
  it('places interjection above both turn bubbles with markers', () => {
    const messages: Message[] = [
      { role: 'user', content: '明天天气怎么样' },
      toolStep('get_weather'),
      { role: 'user', content: '顺便看看后天' },
      finalStep('明天晴，26 度。'),
      boundary,
      finalStep('后天多云，24 度。'),
      boundary,
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(4);
    expect(out[0]?.type).toBe('user');
    expect(out[0]?.content).toBe('明天天气怎么样');
    expect(out[1]?.type).toBe('user');
    expect(out[1]?.content).toBe('顺便看看后天');
    expect(out[2]?.type).toBe('assistant');
    expect(out[2]?.content).toBe('明天晴，26 度。');
    expect(out[2]?.thoughts).toHaveLength(2);
    expect(out[3]?.type).toBe('assistant');
    expect(out[3]?.content).toBe('后天多云，24 度。');
  });

  /** 按摩剧本：App 通知不显示不切组，多个插话排在整轮大泡之上 */
  it('keeps app notification invisible and merges multi-step turn', () => {
    const messages: Message[] = [
      { role: 'user', content: '帮我预约今晚按摩' },
      toolStep('check_schedule'),
      { role: 'app_notification', source: 'massage-app', content: '按摩预约提醒' },
      { role: 'user', content: '改到八点' },
      { role: 'user', content: '加一个肩颈项目' },
      finalStep('已改到八点并加了肩颈项目。'),
      boundary,
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(4);
    expect(out[0]?.type).toBe('user');
    expect(out[0]?.content).toBe('帮我预约今晚按摩');
    expect(out[1]?.type).toBe('user');
    expect(out[1]?.content).toBe('改到八点');
    expect(out[2]?.type).toBe('user');
    expect(out[2]?.content).toBe('加一个肩颈项目');
    expect(out[3]?.type).toBe('assistant');
    expect(out[3]?.content).toBe('已改到八点并加了肩颈项目。');
    expect(out[3]?.thoughts).toHaveLength(2);
    expect(out.some((m) => m.content.includes('按摩预约提醒'))).toBe(false);
  });

  /** 旧数据没有边界条目，形状信号单独工作，回复仍排到插话之下 */
  it('falls back to shape signal for legacy data without markers', () => {
    const messages: Message[] = [
      { role: 'user', content: '旧会话的问题' },
      toolStep('legacy_tool'),
      { role: 'user', content: '旧会话的插话' },
      finalStep('旧会话的回复。'),
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(3);
    expect(out[0]?.type).toBe('user');
    expect(out[1]?.type).toBe('user');
    expect(out[1]?.content).toBe('旧会话的插话');
    expect(out[2]?.type).toBe('assistant');
    expect(out[2]?.content).toBe('旧会话的回复。');
  });

  /** 崩溃留下的半截轮由扫描结束兜底结组 */
  it('flushes trailing partial group at end of scan', () => {
    const messages: Message[] = [
      { role: 'user', content: '触发崩溃的问题' },
      toolStep('slow_tool'),
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(2);
    expect(out[0]?.type).toBe('user');
    expect(out[1]?.type).toBe('assistant');
    expect(out[1]?.content).toBe('');
    // 思考与工具调用各留一条 thought，无正文
    expect(out[1]?.thoughts).toHaveLength(2);
  });

  /** error 消息保持结组，错误截断的半截组不与下一轮合并 */
  it('keeps error as group closer', () => {
    const messages: Message[] = [
      { role: 'user', content: '出错的回合' },
      toolStep('flaky_tool'),
      { role: 'error', content: 'API 调用失败' },
      { role: 'user', content: '重试' },
      finalStep('重试成功。'),
    ];

    const out = useSessionStore.getState().convertSessionMessages(messages);

    expect(out).toHaveLength(5);
    expect(out[0]?.type).toBe('user');
    expect(out[1]?.type).toBe('assistant');
    expect(out[1]?.content).toBe('');
    expect(out[2]?.type).toBe('error');
    expect(out[2]?.content).toBe('API 调用失败');
    expect(out[3]?.type).toBe('user');
    expect(out[4]?.type).toBe('assistant');
    expect(out[4]?.content).toBe('重试成功。');
  });
});
