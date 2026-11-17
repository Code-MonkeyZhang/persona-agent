/**
 * @fileoverview 占用面板纯函数测试：分段瓜分图例口径，补间跳过的同数判定
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
  triggerCompression: vi.fn(),
  getSession: vi.fn(),
  WebSocketClient: vi.fn(),
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  deleteAgent: vi.fn(),
  resolveTimelineIconUrl: (iconUrl: string | undefined) => iconUrl,
  listSessions: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

import { buildSegments, sameRoundedPercent } from '@/components/chat/ContextUsageShell';

describe('buildSegments', () => {
  it('按估算构成瓜分总占用，各段口径为窗口份额', () => {
    const segs = buildSegments(
      { messages: 8000, systemPersona: 4000, toolsSkills: 2000 },
      14
    );
    expect(segs).toEqual([
      { key: 'messages', pct: 8 },
      { key: 'systemPersona', pct: 4 },
      { key: 'toolsSkills', pct: 2 },
    ]);
  });

  it('最大余数法兜住取整漂移，合计等于总占用取整值', () => {
    // 5/3/2 构成在 13% 下逐项四舍五入得 7/4/3 合计 14，漂移一个点
    const segs = buildSegments(
      { messages: 5000, systemPersona: 3000, toolsSkills: 2000 },
      13
    );
    expect(segs.reduce((sum, seg) => sum + seg.pct, 0)).toBe(13);
  });

  it('降序排列保证明暗配档随段序稳定', () => {
    const segs = buildSegments(
      { messages: 1000, systemPersona: 9000, toolsSkills: 4000 },
      14
    );
    expect(segs.map((seg) => seg.key)).toEqual([
      'systemPersona',
      'toolsSkills',
      'messages',
    ]);
  });

  it('总量为零返回空数组由横条降级单段', () => {
    expect(
      buildSegments({ messages: 0, systemPersona: 0, toolsSkills: 0 }, 14)
    ).toEqual([]);
  });
});

describe('sameRoundedPercent 补间跳过判定', () => {
  it('回合末微差取整同数判真，直接落定不播动画', () => {
    // 百万窗口下 10.94% 与 10.95% 的回合落盘微差
    expect(sameRoundedPercent(109387, 109489, 1000000)).toBe(true);
  });

  it('取整边界两侧的四舍五入同归一处判真', () => {
    // 9.6% 与 10.3% 都取整到 10
    expect(sameRoundedPercent(96000, 103000, 1000000)).toBe(true);
  });

  it('跨过整数边界判假走补间', () => {
    // 9.4% 与 10.6% 取整到 9 与 11
    expect(sameRoundedPercent(94000, 106000, 1000000)).toBe(false);
  });

  it('窗口非法判真兜底直落', () => {
    expect(sameRoundedPercent(100, 200, 0)).toBe(true);
  });
});
