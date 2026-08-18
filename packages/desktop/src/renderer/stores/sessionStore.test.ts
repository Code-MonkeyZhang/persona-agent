import { describe, it, expect, vi } from 'vitest';
import { useSessionStore } from './sessionStore';
import type { Message } from '@persona/shared';

vi.mock('../lib/api', () => ({
  listSessions: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  updateSession: vi.fn(),
}));

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
});
