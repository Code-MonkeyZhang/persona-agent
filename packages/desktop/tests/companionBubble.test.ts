/**
 * @file 陪伴气泡空闲回退的查找测试
 * lastRepliedMessage 跳过空正文 assistant 消息的口径在此锁定
 */
import { describe, expect, it, vi } from 'vitest';

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
  resolveTimelineIconUrl: (iconUrl: string | undefined) => iconUrl,
  listSessions: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

import { lastRepliedMessage } from '@/components/companion/CompanionReplyBubble';
import type { UIMessage } from '@/types/chat';

/** 便捷构造一条消息 */
const message = (type: UIMessage['type'], content: string): UIMessage => ({
  id: crypto.randomUUID(),
  type,
  content,
  timestamp: new Date(),
});

describe('lastRepliedMessage 空闲回退查找', () => {
  it('消息流为空时返回 null', () => {
    expect(lastRepliedMessage([])).toBeNull();
  });

  it('跳过正文为空的 assistant 消息，返回更早的非空回复', () => {
    const replied = message('assistant', '上一轮回复');
    const messages = [replied, message('assistant', '')];
    expect(lastRepliedMessage(messages)).toBe(replied);
  });

  it('所有 assistant 消息正文为空或空白时返回 null', () => {
    const messages = [message('assistant', ''), message('assistant', '   ')];
    expect(lastRepliedMessage(messages)).toBeNull();
  });

  it('user 消息不参与查找', () => {
    const replied = message('assistant', '回复');
    const messages = [replied, message('user', '提问')];
    expect(lastRepliedMessage(messages)).toBe(replied);
  });
});
