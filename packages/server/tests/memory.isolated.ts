/**
 * @fileoverview 记忆子系统测试（独立运行，避免 pi-ai mock 污染其它测试）。
 *
 * Mock 策略：
 * - 文件系统：mock paths.js 到临时目录（含 getAgentMemoryDir）；
 * - LLM：mock llm-single-call.js 的 streamSingleTurn，用模块级变量控制返回/抛错。
 *
 * 覆盖：MemoryStore 的 MEMORY.md 读写 / dream_cursor 推进 / readRecentHistorySegment
 * 上限裁切；consolidateMemory 的成功推进、no-op、LLM 失败不推进、标签剥离。
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
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;
let agentsDir: string;

/** 控制 streamSingleTurn 的行为：是否抛错、返回的整理文本 */
let mockShouldThrow = false;
let mockConsolidation = '## 用户\n- 张工';

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => agentsDir,
  getAgentDir: (id: string) => `${agentsDir}/${id}`,
  getAgentConfigPath: (id: string) => `${agentsDir}/${id}/config.json`,
  getAgentSessionsDir: (id: string) => `${agentsDir}/${id}/sessions`,
  getAgentAssetsDir: (id: string) => `${agentsDir}/${id}/assets`,
  getAgentAssetsPoseDir: (id: string) => `${agentsDir}/${id}/assets/pose`,
  getAgentAssetsBodyDir: (id: string) => `${agentsDir}/${id}/assets/body`,
  getAgentAssetsBackgroundsDir: (id: string) =>
    `${agentsDir}/${id}/assets/backgrounds`,
  getAgentMemoryDir: (id: string) => `${agentsDir}/${id}/memory`,
}));

mock.module('../src/agent/llm-single-call.js', () => ({
  streamSingleTurn: async (
    _userMessage: string,
    _systemPrompt: string
  ): Promise<string> => {
    if (mockShouldThrow) throw new Error('mock LLM failure');
    return mockConsolidation;
  },
}));

import { MemoryStore } from '../src/agent/memory/memory-store.js';
import { consolidateMemory } from '../src/server/services/memory-service.js';
import type { AgentConfig } from '../src/agent/types.js';

/** 构造一个最小可用的 AgentConfig（不经文件系统，直接拼对象） */
function makeAgentConfig(id: string): AgentConfig {
  return {
    id,
    name: 'Test Agent',
    systemPrompt: '',
    defaultModel: { provider: 'openai', model: 'gpt-4' },
    maxSteps: 10,
    skillNames: [],
    mcpNames: [],
    compressionThreshold: 50,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('MemoryStore', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
    agentsDir = path.join(tempDir, 'agents');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  it('readMemoryMd 在文件不存在时返回空字符串', () => {
    const store = new MemoryStore('a1');
    expect(store.readMemoryMd()).toBe('');
  });

  it('writeMemoryMd / readMemoryMd 往返，并去除首尾空白', () => {
    const store = new MemoryStore('a2');
    store.writeMemoryMd('\n# Memory\n\n用户喜欢 TypeScript\n');
    expect(store.readMemoryMd()).toBe('# Memory\n\n用户喜欢 TypeScript');
  });

  it('advanceDreamCursor 在当前游标上累加，可链式推进', () => {
    const store = new MemoryStore('a3');
    expect(store.getDreamCursor()).toBe(0);
    store.advanceDreamCursor(3);
    expect(store.getDreamCursor()).toBe(3);
    store.advanceDreamCursor(2);
    expect(store.getDreamCursor()).toBe(5);
  });

  it('readRecentHistorySegment 无 history 时返回空串', () => {
    const store = new MemoryStore('a4');
    expect(store.readRecentHistorySegment()).toBe('');
  });

  it('readRecentHistorySegment 只返回 dream_cursor 之后的条目', () => {
    const store = new MemoryStore('a5');
    store.appendHistory({ cursor: 2, timestamp: 1, content: '旧摘要A' });
    store.appendHistory({ cursor: 4, timestamp: 2, content: '旧摘要B' });
    store.appendHistory({ cursor: 6, timestamp: 3, content: '新摘要C' });
    store.advanceDreamCursor(2); // dream 已整理前两条
    expect(store.readRecentHistorySegment()).toBe('新摘要C');
  });

  it('readRecentHistorySegment 遵守最多条目数上限，保留最新的', () => {
    const store = new MemoryStore('a6');
    for (let i = 0; i < 60; i++) {
      store.appendHistory({ cursor: i, timestamp: i, content: `条目${i}` });
    }
    const lines = store.readRecentHistorySegment().split('\n');
    expect(lines).toHaveLength(50);
    // 最新的优先纳入预算，收集后反转回时间顺序 → 保留条目10..59
    expect(lines[0]).toBe('条目10');
    expect(lines[49]).toBe('条目59');
  });
});

describe('consolidateMemory', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
    agentsDir = path.join(tempDir, 'agents');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
    mockShouldThrow = false;
    mockConsolidation = '## 用户\n- 张工';
  });

  it('成功整理：写 MEMORY.md 并推进 dream_cursor', async () => {
    mockConsolidation = '## 用户\n- 张工';
    const agent = makeAgentConfig('c1');
    const store = new MemoryStore(agent.id);
    store.appendHistory({ cursor: 2, timestamp: 1, content: '[permanent] 张工' });
    store.appendHistory({ cursor: 4, timestamp: 2, content: '[durable] 写 TS' });

    await consolidateMemory(agent);

    expect(store.getDreamCursor()).toBe(2);
    expect(store.readMemoryMd()).toBe('## 用户\n- 张工');
    // 已整理的条目不再出现在 recent history 段
    expect(store.readRecentHistorySegment()).toBe('');
  });

  it('无未处理料时为 no-op：不写 MEMORY.md、不推进指针', async () => {
    const agent = makeAgentConfig('c2');
    const store = new MemoryStore(agent.id);

    await consolidateMemory(agent);

    expect(store.getDreamCursor()).toBe(0);
    expect(store.readMemoryMd()).toBe('');
  });

  it('LLM 失败时不推进指针，下次可原样重跑', async () => {
    mockShouldThrow = true;
    const agent = makeAgentConfig('c3');
    const store = new MemoryStore(agent.id);
    store.appendHistory({ cursor: 2, timestamp: 1, content: '[durable] 测试' });

    await consolidateMemory(agent);

    expect(store.getDreamCursor()).toBe(0);
    expect(store.readMemoryMd()).toBe('');
  });

  it('剥离整理输出中残留的属性标签', async () => {
    mockConsolidation = '[durable] 张工用 TypeScript';
    const agent = makeAgentConfig('c4');
    const store = new MemoryStore(agent.id);
    store.appendHistory({ cursor: 2, timestamp: 1, content: '[permanent] 张工' });

    await consolidateMemory(agent);

    expect(store.readMemoryMd()).toBe('张工用 TypeScript');
  });
});
