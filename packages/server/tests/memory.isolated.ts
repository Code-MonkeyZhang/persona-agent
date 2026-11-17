/**
 * @fileoverview 记忆条目存储的测试。
 *
 * Mock 策略：mock paths.js 到临时目录，走真实文件系统。
 *
 * 覆盖：读写往返、uid 分配、查重、keys 与 title 校验、坏行容忍、时间章、
 * 检索、类型过滤、常驻板块文本。
 * 运行：`bun test ./tests/memory.isolated.ts`
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;
let agentsDir: string;

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => path.join(agentsDir),
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(agentsDir, id, 'assets'),
  getAgentAssetsPoseDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'backgrounds'),
  getAgentMemoryDir: (id: string) => path.join(agentsDir, id, 'memory'),
  getWorkspaceDir: () => path.join(tempDir, 'workspace'),
}));

import {
  MemoryStore,
  buildPinnedSegment,
  formatEntryLine,
} from '../src/agent/memory/memory-store.js';
import type { MemoryEntry, MemoryWriteInput } from '@persona/shared';

/** 构造一条新增输入，字段齐全模拟 zod parse 后的形态 */
function input(overrides: Partial<MemoryWriteInput> = {}): MemoryWriteInput {
  return {
    title: '养猫',
    content: '用户养了一只橘猫',
    keys: ['橘猫'],
    type: 'triggered',
    enabled: true,
    ...overrides,
  };
}

/** 把 JSONL 手工追加一行，用于制造坏行 */
function appendRawLine(agentId: string, line: string): void {
  fs.appendFileSync(
    path.join(agentsDir, agentId, 'memory', 'memory.jsonl'),
    line + '\n'
  );
}

describe('MemoryStore 条目存储', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
    agentsDir = path.join(tempDir, 'agents');
  });

  afterAll(() => {
    rmTempDir(tempDir);
  });

  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  it('write 与 listEntries 往返，八字段落盘读回一致，编号升序', () => {
    const store = new MemoryStore('m1');
    const first = store.writeEntry(input({ content: '第一条' }));
    const second = store.writeEntry(input({ content: '第二条' }));
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const entries = store.listEntries();
    expect(entries.map((e) => e.uid)).toEqual([1, 2]);
    expect(entries[0]).toEqual(first.entry);
    expect(entries[1]).toEqual(second.entry);
  });

  it('uid 空文件从一起，追加递增，删除后不复用', () => {
    const store = new MemoryStore('m2');
    const one = store.writeEntry(input({ content: '一' }));
    store.writeEntry(input({ content: '二' }));
    store.writeEntry(input({ content: '三' }));
    expect(store.forgetEntry(3)).toBe(true);
    const fourth = store.writeEntry(input({ content: '四' }));
    expect(one.ok && one.entry.uid).toBe(1);
    expect(fourth.ok && fourth.entry.uid).toBe(4);
  });

  it('查重折叠大小写与首尾空白，只比 content 不比 keys', () => {
    const store = new MemoryStore('m3');
    store.writeEntry(input({ content: ' 用户养了一只橘猫 ' }));
    const result = store.writeEntry(
      input({ content: '用户养了一只橘猫', keys: ['猫'] })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('duplicate');
    if (result.kind !== 'duplicate') return;
    expect(result.entry.uid).toBe(1);
  });

  it('skipDedup 跳过查重，用户通道想记重复随他', () => {
    const store = new MemoryStore('m4');
    store.writeEntry(input({ content: '同文' }));
    const result = store.writeEntry(input({ content: '同文' }), {
      skipDedup: true,
    });
    expect(result.ok).toBe(true);
    expect(store.listEntries()).toHaveLength(2);
  });

  it('update 改 content 撞另一条被拒，改自己这条放行', () => {
    const store = new MemoryStore('m5');
    store.writeEntry(input({ content: '第一条' }));
    store.writeEntry(input({ content: '第二条' }));

    const clash = store.updateEntry(2, { content: ' 第一条 ' });
    expect(clash.ok).toBe(false);
    expect(clash.ok === false && clash.kind).toBe('duplicate');

    const self = store.updateEntry(1, { content: '第一条' });
    expect(self.ok).toBe(true);
  });

  it('update 未找到返回 notFound', () => {
    const store = new MemoryStore('m6');
    const result = store.updateEntry(9, { content: '无目标' });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.kind).toBe('notFound');
  });

  it('keys 校验，triggered 空 keys 拒绝，pinned 改 triggered 不带 keys 拒绝', () => {
    const store = new MemoryStore('m7');
    const writeBad = store.writeEntry(input({ content: '哑条目', keys: [] }));
    expect(writeBad.ok).toBe(false);
    expect(writeBad.ok === false && writeBad.kind).toBe('invalid');

    store.writeEntry(input({ content: '常驻条目', keys: [], type: 'pinned' }));
    const patchBad = store.updateEntry(1, { type: 'triggered' });
    expect(patchBad.ok).toBe(false);
    expect(patchBad.ok === false && patchBad.kind).toBe('invalid');

    const patchGood = store.updateEntry(1, {
      type: 'triggered',
      keys: ['触发'],
    });
    expect(patchGood.ok).toBe(true);
  });

  it('title 校验，空标题写入与空标题更新都被拒', () => {
    const store = new MemoryStore('m7b');
    const writeBad = store.writeEntry(input({ title: '  ' }));
    expect(writeBad.ok).toBe(false);
    expect(writeBad.ok === false && writeBad.kind).toBe('invalid');

    store.writeEntry(input());
    const patchBad = store.updateEntry(1, { title: '' });
    expect(patchBad.ok).toBe(false);
    expect(patchBad.ok === false && patchBad.kind).toBe('invalid');
  });

  it('坏行容忍，残行被跳过其余条目照常工作', () => {
    const store = new MemoryStore('m8');
    store.writeEntry(input({ content: '好行' }));
    appendRawLine('m8', '{broken json');
    appendRawLine('m8', JSON.stringify({ uid: 'x', content: '坏 uid' }));
    appendRawLine('m8', JSON.stringify({ uid: 99 }));
    store.writeEntry(input({ content: '另一条好行' }));

    const entries = store.listEntries();
    expect(entries).toHaveLength(2);
    // 坏行不参与编号推进，第二行好行紧接第一行
    expect(entries.map((e) => e.uid)).toEqual([1, 2]);
  });

  it('时间章 write 双戳同值，update 后 updatedAt 前移', () => {
    const store = new MemoryStore('m9');
    const written = store.writeEntry(input({ content: '时间' }));
    if (!written.ok) throw new Error('write failed');
    expect(written.entry.createdAt).toBe(written.entry.updatedAt);

    const updated = store.updateEntry(written.entry.uid, {
      title: '新标题',
    });
    if (!updated.ok) throw new Error('update failed');
    expect(updated.entry.updatedAt >= updated.entry.createdAt).toBe(true);
  });

  it('search 空 query 列全部启用条目，带 query 匹配 title、content 与 keys', () => {
    const store = new MemoryStore('m10');
    store.writeEntry(input({ content: '用户养了橘猫', keys: ['橘猫'] }));
    store.writeEntry(input({ content: '用户在上海工作', keys: ['上海'] }));
    store.writeEntry(
      input({ content: '停用条目', keys: ['停用'], enabled: false })
    );

    expect(store.searchEntries('')).toHaveLength(2);
    expect(store.searchEntries('橘猫')).toHaveLength(1);
    expect(store.searchEntries('上海')).toHaveLength(1);
    // 带查询查全量含停用
    expect(store.searchEntries('停用')).toHaveLength(1);
    expect(store.searchEntries('', 1)).toHaveLength(1);

    // '训练' 只出现在标题，命中证明 title 参与检索
    store.writeEntry(
      input({ title: '骑行训练', content: '用户每周练两次', keys: ['骑行'] })
    );
    expect(store.searchEntries('训练')).toHaveLength(1);
  });

  it('search 多词查询按词切分，任一词命中即返回', () => {
    const store = new MemoryStore('m10b');
    store.writeEntry(input({ content: '用户养了橘猫', keys: ['橘猫'] }));
    store.writeEntry(input({ content: '用户在上海工作', keys: ['上海'] }));

    expect(store.searchEntries('橘猫 宠物 cat')).toHaveLength(1);
    expect(store.searchEntries('cat 宠物 橘猫')).toHaveLength(1);
    expect(store.searchEntries('上海 工作')).toHaveLength(1);
    expect(store.searchEntries('北京 天津')).toHaveLength(0);
    // 纯空白查询等同空查询
    expect(store.searchEntries('   ')).toHaveLength(2);
  });

  it('listPinnedEnabled 与 listTriggeredEnabled 只回对应类型的启用条目', () => {
    const store = new MemoryStore('m11');
    store.writeEntry(input({ content: '常驻', keys: [], type: 'pinned' }));
    store.writeEntry(input({ content: '触发', keys: ['触发'] }));
    store.writeEntry(
      input({ content: '常驻停用', keys: [], type: 'pinned', enabled: false })
    );

    expect(store.listPinnedEnabled().map((e) => e.uid)).toEqual([1]);
    expect(store.listTriggeredEnabled().map((e) => e.uid)).toEqual([2]);
  });
});

describe('buildPinnedSegment', () => {
  it('空态返回空串', () => {
    expect(buildPinnedSegment([])).toBe('');
  });

  it('格式逐字符对照，条目按编号升序', () => {
    const pinned = (
      uid: number,
      content: string,
      createdAt: string
    ): MemoryEntry => ({
      uid,
      title: `标题${uid}`,
      content,
      keys: [],
      type: 'pinned',
      enabled: true,
      createdAt,
      updatedAt: createdAt,
    });
    const entries = [
      pinned(1, '用户的生日是三月初七', '2026-08-20T10:00:00.000Z'),
      pinned(2, '用户偏好被称呼为老张', '2026-09-12T10:00:00.000Z'),
    ];
    expect(buildPinnedSegment(entries)).toBe(
      [
        '[Memory] Durable facts you have learned about the user. They persist across sessions. Rely on them to stay consistent and do not re-ask what you already know.',
        '- (learned 2026-08-20) 用户的生日是三月初七',
        '- (learned 2026-09-12) 用户偏好被称呼为老张',
      ].join('\n')
    );
    expect(formatEntryLine(entries[0]!)).toBe(
      '- (learned 2026-08-20) 用户的生日是三月初七'
    );
  });
});
