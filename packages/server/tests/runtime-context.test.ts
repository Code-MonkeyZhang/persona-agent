/**
 * @fileoverview 运行时上下文注入单元测试
 */

import { describe, it, expect, mock } from 'bun:test';

/** MCP 池状态的测试替身：name → status */
const fakeMcpStatuses: Record<string, string> = {};

mock.module('../src/mcp/index.js', () => ({
  getMcpPromptInfo: (serverNames: string[]) =>
    serverNames.map((name) => ({
      name,
      status: fakeMcpStatuses[name] ?? 'unknown',
    })),
}));

import { buildRuntimeContext } from '../src/server/services/runtime-context.js';
import type { Session } from '../src/session/types.js';

/** 构造最小 Session 夹具，overrides 覆盖关注字段 */
function createSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-session',
    agentId: 'test-agent',
    title: 'Test',
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    model: { provider: 'openai', model: 'gpt-4' },
    ...overrides,
  };
}

describe('buildRuntimeContext', () => {
  /** 首次注入：时间行与指令行出现，无变化行 */
  it('injects time and instruction lines on first call', () => {
    const out = buildRuntimeContext(
      's-first',
      createSession(),
      '/w/a',
      undefined,
      new Date('2026-08-18T10:30:00')
    );
    expect(out).toContain('[system] 当前时间：2026-08-18 星期二 10:30');
    expect(out).toContain('以本消息的时间为准');
    expect(out).not.toContain('状态变化');
    expect(out).not.toContain('切换为');
  });

  /** 有历史消息时给出时长，无历史消息时省略时长行 */
  it('includes elapsed line only when lastMessageAt exists', () => {
    const now = new Date('2026-08-18T10:30:00');
    const withHistory = createSession({
      lastMessageAt: Date.parse('2026-08-16T12:16:00'),
    });
    const out1 = buildRuntimeContext(
      's-dur',
      withHistory,
      '/w/a',
      undefined,
      now
    );
    expect(out1).toContain('距上一条消息已过去：1天22小时14分');

    const out2 = buildRuntimeContext(
      's-dur-none',
      createSession(),
      '/w/a',
      undefined,
      now
    );
    expect(out2).not.toContain('距上一条消息');
  });

  /** 阈值内首轮只记基线，返回空串 */
  it('returns empty string within threshold on first call', () => {
    const now = new Date('2026-08-18T10:30:00');
    const out = buildRuntimeContext(
      's-skip',
      createSession({ lastContextAt: now.getTime() - 60_000 }),
      '/w/a',
      undefined,
      now
    );
    expect(out).toBe('');
  });

  /** 阈值内有基线无变化，次轮仍返回空串 */
  it('returns empty string when nothing changed within threshold', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext('s-base', createSession(), '/w/a', undefined, t0);
    const out = buildRuntimeContext(
      's-base',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out).toBe('');
  });

  /** 阈值内仅模型变化：只出变化行，无时间行与指令行 */
  it('emits only change line for model change within threshold', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-model',
      createSession({
        lastContextAt: t0.getTime() - 60_000,
        model: { provider: 'openai', model: 'a' },
      }),
      '/w/a',
      undefined,
      t0
    );
    const out = buildRuntimeContext(
      's-model',
      createSession({
        lastContextAt: t0.getTime() - 30_000,
        model: { provider: 'openai', model: 'b' },
      }),
      '/w/a',
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out).toContain('模型已从 openai/a 切换为 openai/b');
    expect(out).not.toContain('当前时间');
    expect(out).not.toContain('以本消息的时间为准');
  });

  /** 超阈值且有目录与模型变化：时间行、变化行、指令行合并出现 */
  it('merges time and change lines when stale and changed', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-merge',
      createSession({ model: { provider: 'openai', model: 'a' } }),
      '/w/a',
      undefined,
      t0
    );
    const out = buildRuntimeContext(
      's-merge',
      createSession({
        lastContextAt: t0.getTime(),
        lastMessageAt: t0.getTime(),
        model: { provider: 'anthropic', model: 'b' },
      }),
      '/w/b',
      undefined,
      new Date(t0.getTime() + 20 * 60 * 1000)
    );
    expect(out).toContain('当前时间');
    expect(out).toContain('距上一条消息已过去：20分');
    expect(out).toContain('工作目录已从 /w/a 切换为 /w/b');
    expect(out).toContain('模型已从 openai/a 切换为 anthropic/b');
    expect(out).toContain('以本消息的时间为准');
  });

  /** MCP 状态变化产出对应变化行 */
  it('emits change line for MCP status change', () => {
    fakeMcpStatuses['ticktick'] = 'connected';
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-mcp',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      ['ticktick'],
      t0
    );
    fakeMcpStatuses['ticktick'] = 'disconnected';
    const out = buildRuntimeContext(
      's-mcp',
      createSession({ lastContextAt: t0.getTime() - 30_000 }),
      '/w/a',
      ['ticktick'],
      new Date(t0.getTime() + 60_000)
    );
    expect(out).toContain(
      'MCP 服务「ticktick」状态变化：connected → disconnected'
    );
  });

  /** 时长格式覆盖各量级 */
  it('formats elapsed durations across magnitudes', () => {
    const now = new Date('2026-08-18T10:30:00').getTime();
    const cases: Array<[number, string]> = [
      [now - 30_000, '不到1分钟'],
      [now - 5 * 60_000, '5分'],
      [now - (2 * 3600 + 5 * 60) * 1000, '2小时5分'],
      [now - 26 * 3600 * 1000, '1天2小时'],
    ];
    cases.forEach(([at, expected], i) => {
      const out = buildRuntimeContext(
        `s-scale-${i}`,
        createSession({ lastMessageAt: at }),
        '/w/a',
        undefined,
        new Date(now)
      );
      expect(out).toContain(`距上一条消息已过去：${expected}`);
    });
  });
});
