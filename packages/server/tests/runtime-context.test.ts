/**
 * @fileoverview 运行时上下文注入单元测试。
 *
 * Mock 策略：MCP 池状态与记忆存储均用测试替身，fakeTriggered 控制
 * 触发条目命中，文件系统不参与。
 * 覆盖：时间与指令行、首份服务清单、寿命分流、节流解绑、相关记忆节格式
 * 与升序、环境变化节头、变化行各形态、时长格式。
 */

import { describe, it, expect, mock, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { rmTempDir } from './temp-cleanup.js';
import type { MemoryEntry } from '@persona/shared';

/** MCP 池状态的测试替身：name → status */
const fakeMcpStatuses: Record<string, string> = {};

/** MCP 握手说明的测试替身：name → instructions */
const fakeMcpInstructions: Record<string, string> = {};

/** 记忆存储的测试替身：当前会返回的触发条目 */
let fakeTriggered: MemoryEntry[] = [];

mock.module('../src/mcp/index.js', () => ({
  getMcpPromptInfo: (serverNames: string[]) =>
    serverNames.map((name) => ({
      name,
      status: fakeMcpStatuses[name] ?? 'unknown',
      instructions: fakeMcpInstructions[name],
    })),
}));

mock.module('../src/util/paths.js', () => ({
  getAgentMemoryDir: (id: string) => path.join(os.tmpdir(), `ctx-test-${id}`),
}));

mock.module('../src/agent/memory/memory-store.js', () => ({
  MemoryStore: class {
    listTriggeredEnabled(): MemoryEntry[] {
      return fakeTriggered;
    }
  },
  // 行式与真实现同款，格式本身在 memory.isolated 逐字符验证
  formatEntryLine: (entry: MemoryEntry) =>
    `- (learned ${entry.createdAt.slice(0, 10)}) ${entry.content}`,
  buildPinnedSegment: () => '',
}));

import { buildRuntimeContext } from '../src/server/services/runtime-context.js';
import { toolRegistry } from '../src/tools/registry.js';
import type { RegistryEntry } from '../src/tools/registry.js';
import type { Session } from '../src/session/types.js';

/** 注册表的外部测试条目，观察集合派生要求条目在表，显示名走注册表 */
const fakeExternalEntry: RegistryEntry = {
  id: 'ticktick',
  kind: 'mcp',
  name: '滴答清单',
  status: 'connected',
  functions: [],
};
toolRegistry.register(fakeExternalEntry);

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

/** 构造一条触发启用条目 */
function triggeredEntry(
  uid: number,
  keys: string[],
  content: string
): MemoryEntry {
  return {
    uid,
    title: `t${uid}`,
    content,
    keys,
    type: 'triggered',
    enabled: true,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  };
}

describe('buildRuntimeContext', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-ctx-test-'));
  });

  afterAll(() => {
    rmTempDir(tempDir);
    toolRegistry.unregister('ticktick');
  });

  /** 首次注入：时间行与指令行出现在 persisted，无变化行 */
  it('injects time and instruction lines on first call', () => {
    const out = buildRuntimeContext(
      's-first',
      createSession(),
      '/w/a',
      undefined,
      undefined,
      new Date('2026-08-18T10:30:00')
    );
    expect(out.persisted).toContain(
      '[system] 当前时间：2026-08-18 星期二 10:30'
    );
    expect(out.persisted).toContain('以本消息的时间为准');
    expect(out.persisted).not.toContain('状态变化');
    expect(out.persisted).not.toContain('切换为');
    expect(out.ephemeral).toBe('');
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
      undefined,
      now
    );
    expect(out1.persisted).toContain('距上一条消息已过去：1天22小时14分');

    const out2 = buildRuntimeContext(
      's-dur-none',
      createSession(),
      '/w/a',
      undefined,
      undefined,
      now
    );
    expect(out2.persisted).not.toContain('距上一条消息');
  });

  /** 阈值内首轮只记基线，两段皆空 */
  it('returns empty parts within threshold on first call', () => {
    const now = new Date('2026-08-18T10:30:00');
    const out = buildRuntimeContext(
      's-skip',
      createSession({ lastContextAt: now.getTime() - 60_000 }),
      '/w/a',
      undefined,
      undefined,
      now
    );
    expect(out.persisted).toBe('');
    expect(out.ephemeral).toBe('');
  });

  /** 阈值内有基线无变化无命中，次轮仍两段皆空 */
  it('returns empty parts when nothing changed within threshold', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-base',
      createSession(),
      '/w/a',
      undefined,
      undefined,
      t0
    );
    const out = buildRuntimeContext(
      's-base',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      undefined,
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toBe('');
    expect(out.ephemeral).toBe('');
  });

  /** 阈值内仅模型变化：只出变化行与节头，无时间行与指令行 */
  it('emits only change section for model change within threshold', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-model',
      createSession({
        lastContextAt: t0.getTime() - 60_000,
        model: { provider: 'openai', model: 'a' },
      }),
      '/w/a',
      undefined,
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
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toContain('[system] Environment changes:');
    expect(out.persisted).toContain('模型已从 openai/a 切换为 openai/b');
    expect(out.persisted).not.toContain('当前时间');
    expect(out.persisted).not.toContain('以本消息的时间为准');
  });

  /** 超阈值且有目录与模型变化：时间行、变化行、指令行合并出现 */
  it('merges time and change lines when stale and changed', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-merge',
      createSession({ model: { provider: 'openai', model: 'a' } }),
      '/w/a',
      undefined,
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
      undefined,
      new Date(t0.getTime() + 20 * 60 * 1000)
    );
    expect(out.persisted).toContain('当前时间');
    expect(out.persisted).toContain('距上一条消息已过去：20分');
    expect(out.persisted).toContain('工作目录已从 /w/a 切换为 /w/b');
    expect(out.persisted).toContain('模型已从 openai/a 切换为 anthropic/b');
    expect(out.persisted).toContain('以本消息的时间为准');
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
      undefined,
      t0
    );
    fakeMcpStatuses['ticktick'] = 'disconnected';
    const out = buildRuntimeContext(
      's-mcp',
      createSession({ lastContextAt: t0.getTime() - 30_000 }),
      '/w/a',
      ['ticktick'],
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toContain(
      'MCP 服务「ticktick」状态变化：connected → disconnected'
    );
  });

  /** 阈值内技能新增与移除各出一条变化行，无时间行 */
  it('emits change lines for skill assignment updates', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-skill',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      undefined,
      ['a-skill', 'b-skill'],
      t0
    );
    const out = buildRuntimeContext(
      's-skill',
      createSession({ lastContextAt: t0.getTime() - 30_000 }),
      '/w/a',
      undefined,
      ['b-skill', 'c-skill'],
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toContain('技能清单已更新：新增 c-skill');
    expect(out.persisted).toContain('技能清单已更新：移除 a-skill');
    expect(out.persisted).not.toContain('当前时间');
  });

  /** 技能集合不变仅顺序不同，不产出变化行 */
  it('skips change lines when skill order differs but set is same', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-skill-order',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      undefined,
      ['a-skill', 'b-skill'],
      t0
    );
    const out = buildRuntimeContext(
      's-skill-order',
      createSession({ lastContextAt: t0.getTime() - 30_000 }),
      '/w/a',
      undefined,
      ['b-skill', 'a-skill'],
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toBe('');
  });

  /** 快照缺失的轮次发首份服务清单，注册表显示名与说明缩进齐备 */
  it('emits baseline service listing on snapshot miss', () => {
    fakeMcpStatuses['ticktick'] = 'connected';
    fakeMcpInstructions['ticktick'] = 'Use search first.';
    const now = new Date('2026-08-18T10:00:00');
    const out = buildRuntimeContext(
      's-baseline',
      createSession(),
      '/w/a',
      ['ticktick'],
      undefined,
      now
    );
    expect(out.persisted).toContain('[system] 当前接入的外部服务:');
    expect(out.persisted).toContain('- MCP 服务 滴答清单，状态 connected');
    expect(out.persisted).toContain('  Use search first.');
  });

  /** 同进程次轮不再重复清单，无变化时整段静默 */
  it('skips baseline listing on second call', () => {
    fakeMcpStatuses['ticktick'] = 'connected';
    const now = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-baseline-once',
      createSession(),
      '/w/a',
      ['ticktick'],
      undefined,
      now
    );
    const out = buildRuntimeContext(
      's-baseline-once',
      createSession({ lastContextAt: now.getTime() }),
      '/w/a',
      ['ticktick'],
      undefined,
      new Date(now.getTime() + 60_000)
    );
    expect(out.persisted).toBe('');
  });

  /** 时间节被节流但快照缺失时，首份清单照发 */
  it('emits baseline listing even when time line is throttled', () => {
    fakeMcpStatuses['ticktick'] = 'connected';
    const now = new Date('2026-08-18T10:00:00');
    const out = buildRuntimeContext(
      's-baseline-throttle',
      createSession({ lastContextAt: now.getTime() - 60_000 }),
      '/w/a',
      ['ticktick'],
      undefined,
      now
    );
    expect(out.persisted).not.toContain('当前时间');
    expect(out.persisted).toContain('[system] 当前接入的外部服务:');
  });

  /** 内置工具关闭与开启各出一条通知行，显示名取工具集定义 */
  it('emits lines for builtin tool toggles', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-tool',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      ['built_in_terminal', 'built_in_web'],
      undefined,
      t0
    );
    const off = buildRuntimeContext(
      's-tool',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      ['built_in_web'],
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(off.persisted).toContain('- 终端操作工具已由用户关闭');
    const on = buildRuntimeContext(
      's-tool',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      ['built_in_terminal', 'built_in_web'],
      undefined,
      new Date(t0.getTime() + 120_000)
    );
    expect(on.persisted).toContain('- 终端操作工具已由用户开启');
  });

  /** 外部分配与取消分配各出一条行，取消不再误报状态变成 unknown */
  it('emits assign lines for external entries without unknown misreport', () => {
    fakeMcpStatuses['ticktick'] = 'connected';
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-assign',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      [],
      undefined,
      t0
    );
    const assigned = buildRuntimeContext(
      's-assign',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      ['ticktick'],
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(assigned.persisted).toContain('- MCP 服务 滴答清单 已分配');
    expect(assigned.persisted).not.toContain('状态变化');

    const removed = buildRuntimeContext(
      's-assign',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      [],
      undefined,
      new Date(t0.getTime() + 120_000)
    );
    expect(removed.persisted).toContain('- MCP 服务 滴答清单 已取消分配');
    expect(removed.persisted).not.toContain('unknown');
  });

  /** 工具集合不变仅顺序不同，不产出变化行 */
  it('skips change lines when tool order differs but set is same', () => {
    const t0 = new Date('2026-08-18T10:00:00');
    buildRuntimeContext(
      's-tool-order',
      createSession({ lastContextAt: t0.getTime() - 60_000 }),
      '/w/a',
      ['built_in_web', 'built_in_terminal'],
      undefined,
      t0
    );
    const out = buildRuntimeContext(
      's-tool-order',
      createSession({ lastContextAt: t0.getTime() }),
      '/w/a',
      ['built_in_terminal', 'built_in_web'],
      undefined,
      new Date(t0.getTime() + 60_000)
    );
    expect(out.persisted).toBe('');
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
        undefined,
        new Date(now)
      );
      expect(out.persisted).toContain(`距上一条消息已过去：${expected}`);
    });
  });

  /** 相关记忆节：命中条目进 ephemeral，节头与行式齐备，persisted 为空 */
  it('puts hit memories into ephemeral section only', () => {
    fakeTriggered = [
      triggeredEntry(1, ['橘猫'], '用户养了一只橘猫叫大橘'),
      triggeredEntry(2, ['上海'], '用户计划十一月搬到上海'),
    ];
    const out = buildRuntimeContext(
      's-mem',
      createSession({
        lastContextAt: Date.now() - 60_000,
        messages: [
          { role: 'user', content: '我家的橘猫最近总叫' },
          { role: 'assistant', content: '它可能是想要关注' },
        ],
      }),
      '/w/a',
      undefined,
      undefined,
      new Date()
    );
    expect(out.ephemeral).toBe(
      [
        '[system] 长期记忆，均为你此前亲手记录的既成事实，回答相关问题时优先以此为据:',
        '- (learned 2026-10-30) 用户养了一只橘猫叫大橘',
      ].join('\n')
    );
    expect(out.persisted).toBe('');
    fakeTriggered = [];
  });

  /** 节流解绑：时间节被节流但记忆命中时 ephemeral 非空 */
  it('still emits ephemeral when time section is throttled', () => {
    fakeTriggered = [triggeredEntry(1, ['猫'], '用户养了猫')];
    const now = new Date('2026-08-18T10:30:00');
    const out = buildRuntimeContext(
      's-mem-throttle',
      createSession({
        lastContextAt: now.getTime() - 60_000,
        messages: [{ role: 'user', content: '聊聊猫' }],
      }),
      '/w/a',
      undefined,
      undefined,
      now
    );
    expect(out.persisted).toBe('');
    expect(out.ephemeral).toContain('用户养了猫');
    fakeTriggered = [];
  });

  /** 未命中时记忆节不出现 */
  it('omits memory section when nothing hits', () => {
    fakeTriggered = [triggeredEntry(1, ['橘猫'], '用户养了橘猫')];
    const now = new Date('2026-08-18T10:30:00');
    const out = buildRuntimeContext(
      's-mem-none',
      createSession({ messages: [{ role: 'user', content: '聊点别的' }] }),
      '/w/a',
      undefined,
      undefined,
      now
    );
    expect(out.ephemeral).toBe('');
    expect(out.persisted).toContain('当前时间');
    fakeTriggered = [];
  });

  /** 两节皆有：persisted 与 ephemeral 分开返回 */
  it('returns both parts when time section and memory hits coexist', () => {
    fakeTriggered = [triggeredEntry(1, ['猫'], '用户养了猫')];
    const out = buildRuntimeContext(
      's-mem-both',
      createSession({
        messages: [{ role: 'user', content: '聊聊猫' }],
      }),
      '/w/a',
      undefined,
      undefined,
      new Date('2026-08-18T10:30:00')
    );
    expect(out.persisted).toContain('当前时间');
    expect(out.ephemeral).toContain('[system] 长期记忆');
    fakeTriggered = [];
  });
});
