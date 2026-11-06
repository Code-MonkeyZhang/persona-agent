/**
 * @fileoverview 触发匹配纯函数的单元测试。
 *
 * 覆盖：单词边界、英文复数词尾、拼接缝、中文包含、大小写、多词短语、
 * 正则特殊字符按普通字符处理、扫描窗口角色过滤与正序拼接、
 * 命中多条全量返回按传入顺序。
 * 运行：`bun test ./tests/entry-matcher.test.ts`
 */
import { describe, it, expect } from 'bun:test';
import type { MemoryEntry } from '@persona/shared';
import type { Message } from '../src/schema/index.js';
import {
  buildScanText,
  matchTriggered,
} from '../src/agent/memory/entry-matcher.js';

/** 构造一条触发启用条目 */
function entry(uid: number, keys: string[]): MemoryEntry {
  return {
    uid,
    title: `t${uid}`,
    content: `内容${uid}`,
    keys,
    type: 'triggered',
    enabled: true,
    createdAt: '2026-11-05T00:00:00.000Z',
    updatedAt: '2026-11-05T00:00:00.000Z',
  };
}

/** 构造一条带文本的消息 */
function msg(role: Message['role'], content: string): Message {
  return { role, content } as Message;
}

describe('matchTriggered', () => {
  it('单词触发词做边界判断，不命中词内扩展', () => {
    const entries = [entry(1, ['cat'])];
    expect(matchTriggered(entries, 'concatenate the values')).toHaveLength(0);
    expect(matchTriggered(entries, 'my_cat variable')).toHaveLength(0);
  });

  it('单词触发词容许英文复数词尾命中', () => {
    const postcard = [entry(1, ['postcard'])];
    expect(
      matchTriggered(postcard, 'new postcards for my collection')
    ).toHaveLength(1);
    const box = [entry(2, ['box'])];
    expect(matchTriggered(box, 'boxes on the shelf')).toHaveLength(1);
    const klass = [entry(3, ['class'])];
    expect(matchTriggered(klass, 'two classes today')).toHaveLength(1);
    const cat = [entry(4, ['cat'])];
    expect(matchTriggered(cat, 'my cats and dogs')).toHaveLength(1);
  });

  it('复数词尾后仍是词内字符时不命中', () => {
    const entries = [entry(1, ['postcard'])];
    expect(matchTriggered(entries, 'postcardss typo')).toHaveLength(0);
    expect(matchTriggered(entries, 'catalog postcardx')).toHaveLength(0);
  });

  it('单词命中首尾位置视为边界成立', () => {
    const entries = [entry(1, ['cat'])];
    expect(matchTriggered(entries, 'cat')).toHaveLength(1);
    expect(matchTriggered(entries, 'the cat')).toHaveLength(1);
    expect(matchTriggered(entries, 'cat and dog')).toHaveLength(1);
  });

  it('中文触发词天然处处边界，等效包含匹配', () => {
    const entries = [entry(1, ['上海'])];
    expect(matchTriggered(entries, '我打算搬去上海市')).toHaveLength(1);
  });

  it('大小写全程不敏感', () => {
    const entries = [entry(1, ['apple'])];
    expect(matchTriggered(entries, 'I bought an Apple today')).toHaveLength(1);
  });

  it('多词短语直接包含匹配，不做边界判断', () => {
    const entries = [entry(1, ['new york'])];
    expect(matchTriggered(entries, 'I love New York City')).toHaveLength(1);
  });

  it('正则特殊字符只是普通字符', () => {
    const entries = [entry(1, ['c++'])];
    expect(matchTriggered(entries, '我在学C++')).toHaveLength(1);
    expect(matchTriggered(entries, 'c+ 不命中')).toHaveLength(0);
  });

  it('多条命中全量返回，按传入顺序', () => {
    const entries = [entry(1, ['猫']), entry(2, ['上海']), entry(3, ['狗'])];
    const hits = matchTriggered(entries, '用户的猫和上海的狗');
    expect(hits.map((e) => e.uid)).toEqual([1, 2, 3]);
  });

  it('空扫描文本不命中', () => {
    const entries = [entry(1, ['cat'])];
    expect(matchTriggered(entries, '')).toHaveLength(0);
  });
});

describe('buildScanText', () => {
  it('只取最近两条 user 与 assistant 消息，正序拼接', () => {
    const messages = [
      msg('user', '第一条'),
      msg('assistant', '第二条'),
      msg('user', '第三条'),
    ];
    expect(buildScanText(messages)).toBe('第二条\n第三条');
  });

  it('context 与 app_notification 角色不进窗口', () => {
    const messages = [
      msg('user', '用户话'),
      { role: 'context', source: 'runtime-context', content: '环境变化' },
      { role: 'app_notification', source: 'todo', content: '提醒' },
      msg('assistant', '回复'),
    ];
    expect(buildScanText(messages)).toBe('用户话\n回复');
  });

  it('拼接缝处恰好拼成触发词时不命中', () => {
    // 第一条结尾是 con，第二条开头是 cat，直接相连拼出 concat，不是触发词的完整词
    const messages = [msg('user', '说了con'), msg('assistant', 'cat 之后')];
    const entries = [entry(1, ['concat'])];
    expect(matchTriggered(entries, buildScanText(messages))).toHaveLength(0);
  });

  it('空文本消息跳过，不占窗口名额', () => {
    const messages = [
      msg('user', '有效消息'),
      msg('assistant', ''),
      msg('user', '最近消息'),
    ];
    expect(buildScanText(messages)).toBe('有效消息\n最近消息');
  });
});
