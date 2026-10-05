/**
 * @fileoverview 桌面缓存库测试：快照装载、变更回放幂等与读取形状。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  Message,
  SessionChange,
  SessionMeta,
  SnapshotSession,
} from '@persona/shared';
import { CacheDb } from '../src/main/cache/cache-db';

/** 临时库目录 */
let tempDir: string;
/** 缓存库实例 */
let db: CacheDb;

/** 造会话元信息 */
function meta(
  id: string,
  agentId: string,
  overrides: Partial<SessionMeta> = {}
): SessionMeta {
  return {
    id,
    agentId,
    title: id,
    createdAt: 1,
    updatedAt: 1,
    model: { provider: 'p', model: 'm' },
    ...overrides,
  };
}

/** 造快照会话，messages 为行号加消息对 */
function snapSession(
  m: SessionMeta,
  messages: Array<{ seq: number; message: Message; createdAt?: number }>,
  turnEnds?: number[]
): SnapshotSession {
  return {
    ...m,
    turnEnds,
    messages: messages.map((x) => ({
      seq: x.seq,
      message: x.message,
      createdAt: x.createdAt ?? 100,
    })),
  };
}

/** 造变更事件 */
function change(
  seq: number,
  kind: SessionChange['kind'],
  sessionId: string | null,
  data: unknown
): SessionChange {
  return { seq, kind, sessionId, data, createdAt: seq };
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-db-test-'));
  db = new CacheDb(path.join(tempDir, 'desktop-cache.db'));
});

afterAll(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('CacheDb', () => {
  /** 测试空库游标为零读列表为空 */
  it('should start with zero cursor and empty reads', () => {
    expect(db.getCursor()).toBe(0);
    expect(db.listSessions('a1')).toEqual([]);
    expect(db.getSession('s1')).toBeNull();
  });

  /** 测试快照装载后列表排序、聊天预览与游标推进 */
  it('should load snapshot with ordered sessions and chat preview', () => {
    const chat = snapSession(
      meta('chat-a1', 'a1', { updatedAt: 10 }),
      [
        { seq: 1, message: { role: 'user', content: '你好' } },
        { seq: 2, message: { role: 'assistant', content: '在的' } },
      ],
      [1]
    );
    const task = snapSession(meta('t1', 'a1', { updatedAt: 20 }), [
      { seq: 3, message: { role: 'user', content: '任务' } },
    ]);
    db.applySnapshot({ latestSeq: 30, sessions: [chat, task] });

    expect(db.getCursor()).toBe(30);
    const sessions = db.listSessions('a1');
    expect(sessions.map((s) => s.id)).toEqual(['t1', 'chat-a1']);
    expect(sessions[1].lastMessage).toBe('在的');
    expect(sessions[0].lastMessage).toBeUndefined();
  });

  /** 测试读取形状：行号挂载、边界混入、派生时间戳 */
  it('should assemble session with seq attached, boundaries and derived stamps', () => {
    const session = db.getSession('chat-a1');
    if (!session) throw new Error('session missing');

    expect(session.messages).toHaveLength(3);
    expect(session.messages[0].seq).toBe(1);
    // 边界条目在第一条消息之后，与 HTTP 详情接口同形
    expect(session.messages[1]).toMatchObject({
      role: 'system',
      turnEnd: true,
    });
    expect(session.messages[2].seq).toBe(2);
    expect(session.turnEnds).toEqual([1]);
    expect(session.lastMessageAt).toBe(100);
  });

  /** 测试变更回放按序应用，快照重叠部分靠消息行号去重 */
  it('should replay changes idempotently with message seq dedup', () => {
    // seq 28 与快照重叠，消息行号 2 已存在；seq 31 是新消息
    db.applyChanges([
      change(28, 'message_appended', 'chat-a1', {
        seq: 2,
        message: { role: 'assistant', content: '在的' },
        createdAt: 100,
      }),
      change(31, 'message_appended', 'chat-a1', {
        seq: 9,
        message: { role: 'user', content: '新消息' },
        createdAt: 300,
      }),
    ]);
    expect(db.getCursor()).toBe(31);

    const session = db.getSession('chat-a1');
    expect(session?.messages.filter((m) => m.seq === 2)).toHaveLength(1);
    expect(session?.messages.some((m) => m.seq === 9)).toBe(true);

    // 重复推送同一事件被游标挡住
    db.applyChanges([
      change(31, 'message_appended', 'chat-a1', {
        seq: 9,
        message: { role: 'user', content: '新消息' },
        createdAt: 300,
      }),
    ]);
    expect(db.getCursor()).toBe(31);
    expect(
      db.getSession('chat-a1')?.messages.filter((m) => m.seq === 9)
    ).toHaveLength(1);
  });

  /** 测试旧格式 message_appended 不带消息体时跳过但游标前进 */
  it('should skip legacy message events without payload', () => {
    db.applyChanges([change(32, 'message_appended', 'chat-a1', { seq: 99 })]);
    expect(db.getCursor()).toBe(32);
    expect(db.getSession('chat-a1')?.messages.some((m) => m.seq === 99)).toBe(
      false
    );
  });

  /** 测试 session_updated 全量替换元信息 */
  it('should replace meta on session_updated', () => {
    db.applyChanges([
      change(33, 'session_updated', 't1', {
        ...meta('t1', 'a1', { updatedAt: 33, title: '改名' }),
        lastContextAt: 1,
        lastMessageAt: 2,
        turnEnds: [1],
      }),
    ]);
    const sessions = db.listSessions('a1');
    expect(sessions[0].id).toBe('t1');
    expect(sessions[0].title).toBe('改名');
    expect(db.getSession('t1')?.turnEnds).toEqual([1]);
  });

  /** 测试角色列表缓存与删除 */
  it('should store agents and clear rows on agent delete', () => {
    db.putAgents([
      {
        id: 'a1',
        name: 'A1',
        systemPrompt: '',
        defaultModel: { provider: 'p', model: 'm' },
        maxSteps: 5,
        compressionThreshold: 50,
        dreamIntervalMinutes: 120,
        mcpNames: [],
        skillNames: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(db.listAgents()).toHaveLength(1);

    db.deleteAgent('a1');
    expect(db.listSessions('a1')).toEqual([]);
    expect(db.getSession('chat-a1')).toBeNull();
    expect(db.listAgents()).toEqual([]);
  });

  /** 测试 reset 清空数据游标归零 */
  it('should reset all data and cursor', () => {
    db.reset();
    expect(db.getCursor()).toBe(0);
    expect(db.listAgents()).toEqual([]);
  });
});
