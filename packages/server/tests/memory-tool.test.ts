/**
 * @fileoverview memory 工具壳的测试，四动作各自一个类。
 *
 * Mock 策略：mock paths.js 到临时目录，走真实 MemoryStore 落盘。
 * 覆盖：write 成功与撞重、write 缺 title 与空 keys 校验、update 未找到与
 * 空标题校验、forget 回原文、search 空查询与关键词与 limit、
 * update 与 forget 缺 uid 回 success false。
 * 运行：`bun test ./tests/memory-tool.test.ts`
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
  MemoryWriteTool,
  MemoryUpdateTool,
  MemoryForgetTool,
  MemorySearchTool,
} from '../src/tools/memory-tools.js';

describe('memory tools', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-tool-test-'));
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

  it('write 成功返回编号', async () => {
    const tool = new MemoryWriteTool('t1');
    const result = await tool.execute({
      title: '养猫',
      content: '用户养了一只橘猫叫大橘',
      keys: ['橘猫'],
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe(
      'Recorded as #1. It will be injected from the next turn.'
    );
  });

  it('write 撞重返回已有编号与原文，引导改走 update', async () => {
    const tool = new MemoryWriteTool('t2');
    await tool.execute({
      title: '养猫',
      content: '用户养了一只橘猫叫大橘',
      keys: ['橘猫'],
    });
    const result = await tool.execute({
      title: '养猫',
      content: '用户养了一只橘猫叫大橘',
      keys: ['猫'],
    });
    expect(result.success).toBe(true);
    expect(result.content).toContain('Already recorded as #1');
    expect(result.content).toContain('用户养了一只橘猫叫大橘');
    expect(result.content).toContain('built_in_memory__update');
  });

  it('write 缺 content 回 success false', async () => {
    const tool = new MemoryWriteTool('t3');
    const result = await tool.execute({ keys: ['猫'] });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('write 缺 title 回 success false', async () => {
    const tool = new MemoryWriteTool('t3b');
    const result = await tool.execute({
      content: '用户养了一只橘猫叫大橘',
      keys: ['橘猫'],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('title');
  });

  it('write 空 keys 的 triggered 条目回校验错误', async () => {
    const tool = new MemoryWriteTool('t4');
    const result = await tool.execute({
      title: '哑条目',
      content: '哑条目',
      keys: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('key');
  });

  it('update 成功回完整条目行', async () => {
    const write = new MemoryWriteTool('t5');
    await write.execute({
      title: '旧标题',
      content: '旧内容',
      keys: ['旧'],
    });
    const update = new MemoryUpdateTool('t5');
    const result = await update.execute({
      uid: 1,
      content: '新内容',
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe('Updated #1 [triggered] 新内容 (keys: 旧)');
  });

  it('update 未找到引导先 search', async () => {
    const tool = new MemoryUpdateTool('t6');
    const result = await tool.execute({
      uid: 9,
      content: '内容',
    });
    expect(result.success).toBe(true);
    expect(result.content).toContain('No entry #9');
  });

  it('update 传空白 title 回 success false', async () => {
    const write = new MemoryWriteTool('t6b');
    await write.execute({
      title: '标题',
      content: '内容',
      keys: ['词'],
    });
    const update = new MemoryUpdateTool('t6b');
    const result = await update.execute({
      uid: 1,
      title: '   ',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('title');
  });

  it('update 缺 uid 回 success false', async () => {
    const tool = new MemoryUpdateTool('t7');
    const result = await tool.execute({ content: '没有编号' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('uid');
  });

  it('forget 成功回被删条目原文', async () => {
    const write = new MemoryWriteTool('t8');
    await write.execute({
      title: '遗忘测试',
      content: '要遗忘的内容',
      keys: ['遗忘'],
    });
    const forget = new MemoryForgetTool('t8');
    const result = await forget.execute({ uid: 1 });
    expect(result.success).toBe(true);
    expect(result.content).toBe('Forgotten #1: 要遗忘的内容');
  });

  it('forget 缺 uid 回 success false', async () => {
    const tool = new MemoryForgetTool('t8b');
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('uid');
  });

  it('search 空 query 列全部启用条目，带 query 匹配 content 与 keys', async () => {
    const write = new MemoryWriteTool('t9');
    const update = new MemoryUpdateTool('t9');
    await write.execute({
      title: '养猫',
      content: '用户养了橘猫',
      keys: ['橘猫'],
    });
    await write.execute({
      title: '工作城市',
      content: '用户在上海工作',
      keys: ['上海'],
    });
    await write.execute({
      title: '停用条目',
      content: '停用条目',
      keys: ['停用'],
    });
    await update.execute({ uid: 3, enabled: false });

    const search = new MemorySearchTool('t9');
    const all = await search.execute({ query: '' });
    expect(all.success).toBe(true);
    expect(all.content.split('\n')).toHaveLength(2);

    const byKey = await search.execute({ query: '上海' });
    expect(byKey.content).toContain(
      '#2 [triggered] 用户在上海工作 (keys: 上海)'
    );

    const byContent = await search.execute({ query: '橘猫' });
    expect(byContent.content).toContain('用户养了橘猫');

    const none = await search.execute({ query: '不存在的词' });
    expect(none.content).toBe('No matching entries.');
  });

  it('search limit 截断返回条数', async () => {
    const write = new MemoryWriteTool('t10');
    for (let i = 1; i <= 5; i++) {
      await write.execute({
        title: `条目标题${i}`,
        content: `条目${i}`,
        keys: [`词${i}`],
      });
    }
    const search = new MemorySearchTool('t10');
    const result = await search.execute({ query: '', limit: 3 });
    expect(result.content.split('\n')).toHaveLength(3);
  });

  it('四个类的名字与参数表就位', () => {
    expect(new MemoryWriteTool('x').name).toBe('write');
    expect(new MemoryUpdateTool('x').name).toBe('update');
    expect(new MemoryForgetTool('x').name).toBe('forget');
    expect(new MemorySearchTool('x').name).toBe('search');
    expect(new MemoryWriteTool('x').parameters).toHaveProperty('properties');
  });
});
