/**
 * @fileoverview 工具系统核心机制的测试。
 *
 * 覆盖：ToolRegistry 的同名报错与顺序稳定与订阅、内置五组的登记与全名、
 * effectiveToolNames 的默认派生、updateAgentConfig 的分配直写、
 * migrateLegacyToolNames 的存量迁移。
 * Mock 策略：mock paths.js 到临时目录，agent 配置走真实文件落盘。
 * 运行：`bun test ./tests/tool-system.test.ts`
 */
import { describe, it, expect, afterAll, mock } from 'bun:test';
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

tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-system-test-'));
agentsDir = path.join(tempDir, 'agents');
fs.mkdirSync(agentsDir, { recursive: true });

import { ToolRegistry, pickDisplayText } from '../src/tools/registry.js';
import {
  BUILTIN_TOOLSETS,
  effectiveToolNames,
  registerBuiltinToolsets,
  toFullName,
} from '../src/tools/builtin-toolsets.js';
import { toolRegistry } from '../src/tools/registry.js';
import type { RegistryEntry } from '../src/tools/registry.js';

function makeEntry(id: string): RegistryEntry {
  return {
    id,
    kind: 'mcp',
    name: id,
    status: 'failed',
    functions: [{ name: `${id}__fn`, shortName: 'fn' }],
  };
}

describe('ToolRegistry', () => {
  it('同名注册抛错拒绝静默覆盖', () => {
    const registry = new ToolRegistry();
    registry.register(makeEntry('a'));
    expect(() => registry.register(makeEntry('a'))).toThrow(/already exists/);
  });

  it('快照按注册顺序返回且是深拷贝', () => {
    const registry = new ToolRegistry();
    registry.register(makeEntry('b'));
    registry.register(makeEntry('a'));

    const snapshot = registry.snapshot();
    expect(snapshot.map((e) => e.id)).toEqual(['b', 'a']);

    snapshot[0]!.functions[0]!.shortName = 'mutated';
    expect(registry.get('b')!.functions[0]!.shortName).toBe('fn');
  });

  it('update 回注与 unregister 注销并通知订阅者', () => {
    const registry = new ToolRegistry();
    const seen: string[] = [];
    const unsubscribe = registry.subscribe((id) => seen.push(id));

    registry.register(makeEntry('a'));
    expect(registry.update('a', { status: 'connected' })).toBe(true);
    expect(registry.get('a')!.status).toBe('connected');
    expect(registry.update('missing', { status: 'connected' })).toBe(false);

    expect(registry.unregister('a')).toBe(true);
    expect(registry.get('a')).toBeUndefined();

    unsubscribe();
    registry.register(makeEntry('c'));
    expect(seen).toEqual(['a', 'a', 'a']);
  });
});

describe('builtin toolsets', () => {
  it('五组登记进注册表，顺序即定义顺序，功能名带前缀', () => {
    registerBuiltinToolsets();
    const snapshot = toolRegistry.snapshot();

    expect(snapshot.map((e) => e.id)).toEqual([
      'built_in_terminal',
      'built_in_files',
      'built_in_web',
      'built_in_pose',
      'built_in_memory',
    ]);
    expect(snapshot.every((e) => e.kind === 'builtin')).toBe(true);
    expect(snapshot.every((e) => e.status === 'connected')).toBe(true);

    const memory = toolRegistry.get('built_in_memory')!;
    expect(memory.functions.map((fn) => fn.name)).toEqual([
      'built_in_memory__write',
      'built_in_memory__update',
      'built_in_memory__forget',
      'built_in_memory__search',
    ]);
    const terminal = toolRegistry.get('built_in_terminal')!;
    expect(terminal.functions.map((fn) => fn.shortName)).toEqual([
      'bash',
      'bash_output',
      'bash_kill',
    ]);
  });

  it('中文基底与英文覆盖成对登记，条目与功能与文档俱全', () => {
    registerBuiltinToolsets();

    const memory = toolRegistry.get('built_in_memory')!;
    expect(memory.name).toBe('记忆');
    expect(memory.nameEn).toBe('Memory');
    expect(memory.description).toBe('读写关于用户的长期记忆条目');
    expect(memory.descriptionEn).toBe(
      'Store and recall long-term entries about the user'
    );
    expect(memory.meta?.instructions).toContain('能力说明');
    expect(memory.meta?.instructionsEn).toContain('What it does');

    const terminal = toolRegistry.get('built_in_terminal')!;
    expect(terminal.functions[0]?.description).toBe(
      '在 shell 里执行命令并取回输出'
    );
    expect(terminal.functions[0]?.descriptionEn).toBe(
      'Run a command in the shell and return its output'
    );
  });

  it('create 构造的执行体名字带条目前缀', () => {
    const deps = {
      workspaceDir: tempDir,
      bashPath: undefined,
      agentId: 'agent-x',
      sessionId: 'session-x',
      sessionManager: {} as never,
    };
    const names = BUILTIN_TOOLSETS.flatMap((def) =>
      def.create(deps).map((tool) => tool.name)
    );
    expect(names).toContain('built_in_terminal__bash');
    expect(names).toContain('built_in_files__read_file');
    expect(names).toContain('built_in_web__web_fetch');
    expect(names).toContain('built_in_pose__show_pose');
    expect(names).toContain('built_in_memory__write');
    expect(names).toHaveLength(13);
    expect(toFullName('built_in_memory', 'write')).toBe(
      'built_in_memory__write'
    );
  });
});

describe('pickDisplayText', () => {
  it('语言是中文时永远取基底，覆盖存在也不动', () => {
    expect(pickDisplayText('终端操作', 'Terminal', 'zh-CN')).toBe('终端操作');
  });

  it('语言是英文且有覆盖时取覆盖', () => {
    expect(pickDisplayText('终端操作', 'Terminal', 'en')).toBe('Terminal');
  });

  it('语言是英文但无覆盖时回落基底，外部条目走这条', () => {
    expect(pickDisplayText('Notion', undefined, 'en')).toBe('Notion');
    expect(pickDisplayText(undefined, undefined, 'en')).toBeUndefined();
  });
});

describe('effectiveToolNames', () => {
  it('toolNames 缺失时内置全分配', () => {
    const derived = effectiveToolNames({});
    expect(derived).toEqual([
      'built_in_terminal',
      'built_in_files',
      'built_in_web',
      'built_in_pose',
      'built_in_memory',
    ]);
  });

  it('toolNames 存在时直接采用', () => {
    expect(effectiveToolNames({ toolNames: ['built_in_memory'] })).toEqual([
      'built_in_memory',
    ]);
  });
});

describe('updateAgentConfig 分配直写', () => {
  afterAll(() => {
    rmTempDir(tempDir);
  });

  async function createAgent(): Promise<string> {
    const { createAgentConfig } =
      await import('../src/agent/agent-config-store.js');
    const agent = createAgentConfig({
      name: 'T',
      systemPrompt: 'p',
      defaultModel: { provider: 'openai', model: 'gpt' },
      maxSteps: 5,
      skillNames: [],
    });
    return agent.id;
  }

  it('写 toolNames 时直接采用且不再产出 mcpNames', async () => {
    const id = await createAgent();
    const { updateAgentConfig, getAgentConfig } =
      await import('../src/agent/agent-config-store.js');

    const updated = updateAgentConfig(id, {
      toolNames: [
        'built_in_terminal',
        'built_in_memory',
        'ticktick',
        'pomodoro',
      ],
    });
    expect(updated.toolNames).toEqual([
      'built_in_terminal',
      'built_in_memory',
      'ticktick',
      'pomodoro',
    ]);
    expect('mcpNames' in updated).toBe(false);

    const reread = getAgentConfig(id)!;
    expect(reread.toolNames).toContain('ticktick');
    expect('mcpNames' in reread).toBe(false);
  });
});

describe('migrateLegacyToolNames 存量迁移', () => {
  afterAll(() => {
    rmTempDir(tempDir);
  });

  /** 手写一份旧格式 config.json，额外字段由用例指定 */
  function writeLegacyConfig(id: string, fields: Record<string, unknown>) {
    const dir = path.join(agentsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({
        id,
        name: 'legacy',
        systemPrompt: 'p',
        defaultModel: { provider: 'openai', model: 'gpt' },
        maxSteps: 5,
        skillNames: [],
        compressionThreshold: 50,
        createdAt: 1,
        updatedAt: 1,
        ...fields,
      })
    );
  }

  /** 读回 config.json 的原始 JSON，迁移断言直接看落盘字段 */
  function readRawConfig(id: string): Record<string, unknown> {
    return JSON.parse(
      fs.readFileSync(path.join(agentsDir, id, 'config.json'), 'utf-8')
    ) as Record<string, unknown>;
  }

  it('toolNames 缺失且 mcpNames 有值时折算写回并剥掉旧字段', async () => {
    writeLegacyConfig('legacy-a', { mcpNames: ['ticktick'] });
    const { migrateLegacyToolNames } = await import(
      '../src/agent/agent-config-store.js'
    );
    migrateLegacyToolNames();

    const raw = readRawConfig('legacy-a');
    expect(raw['mcpNames']).toBeUndefined();
    expect(raw['toolNames']).toEqual([
      'built_in_terminal',
      'built_in_files',
      'built_in_web',
      'built_in_pose',
      'built_in_memory',
      'ticktick',
    ]);
  });

  it('已有 toolNames 时只翻译裸内置 id 且外部条目原样保留', async () => {
    writeLegacyConfig('legacy-b', {
      toolNames: ['bash', 'ticktick', 'memory'],
      mcpNames: ['ticktick'],
    });
    const { migrateLegacyToolNames } = await import(
      '../src/agent/agent-config-store.js'
    );
    migrateLegacyToolNames();

    const raw = readRawConfig('legacy-b');
    expect(raw['mcpNames']).toBeUndefined();
    expect(raw['toolNames']).toEqual([
      'built_in_terminal',
      'ticktick',
      'built_in_memory',
    ]);
  });

  it('新格式配置不被改写', async () => {
    writeLegacyConfig('legacy-c', { toolNames: ['built_in_memory'] });
    const before = fs.readFileSync(
      path.join(agentsDir, 'legacy-c', 'config.json'),
      'utf-8'
    );
    const { migrateLegacyToolNames } = await import(
      '../src/agent/agent-config-store.js'
    );
    migrateLegacyToolNames();

    const after = fs.readFileSync(
      path.join(agentsDir, 'legacy-c', 'config.json'),
      'utf-8'
    );
    expect(after).toBe(before);
  });
});
