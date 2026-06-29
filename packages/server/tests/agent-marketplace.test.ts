/**
 * @fileoverview Agent 商城安装器测试
 *
 * 覆盖：
 * - AgentMarketplaceEntrySchema 校验
 * - installAgentFromMarketplace（正常安装 / config.json 缺失 / config.json 非法 / 防御性清理 / 资产复制 / 临时目录清理）
 *
 * Mock 策略：
 * - paths.ts → 指向临时目录（createAgentConfig 用到的全部 path helper）
 * - logger.ts → 静音
 * - downloader.ts → downloadPackage 在临时目录造文件（可控的 config.json / assets / voiceSample）
 * createAgentConfig 使用真实实现（只依赖 paths + fs，不涉及网络）。
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
import { AgentMarketplaceEntrySchema } from '@persona/shared';
import type { AgentMarketplaceEntry } from '@persona/shared';

// ─── 临时目录 ───────────────────────────────────────────────

let tempDir: string;
let agentsDir: string;

// ─── Mock 控制 ──────────────────────────────────────────────

/** 控制 downloadPackage 造的 config.json 内容，null 表示不写 */
let mockConfigContent: Record<string, unknown> | null;

/** 控制 downloadPackage 造的 systemPrompt.md 内容，null 表示不写 */
let mockSystemPrompt: string | null;

/** 控制 downloadPackage 是否创建 assets 目录（avatar + pose/default） */
let mockCreateAssets: boolean;

/** 控制 downloadPackage 是否写语音样本文件（值为文件名），null 表示不写 */
let mockVoiceSampleFile: string | null;

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => agentsDir,
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(agentsDir, id, 'assets'),
  getAgentAssetsPoseDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'backgrounds'),
  getAgentSessionsDir: (id: string) => path.join(agentsDir, id, 'sessions'),
  getAgentMemoryDir: (id: string) => path.join(agentsDir, id, 'memory'),
  // 以下给同进程的 marketplace.test.ts / mcp-marketplace.test.ts 用
  getSkillsDir: () => path.join(tempDir, 'skills'),
  getMcpServersDir: () => path.join(tempDir, 'mcp-servers'),
  getMcpConfigPath: () => path.join(tempDir, 'mcp.json'),
  getOAuthTokensPath: () => path.join(tempDir, 'tokens.json'),
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

mock.module('../src/marketplace/downloader.js', () => ({
  downloadPackage: async (_remotePath: string, destDir: string) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (mockConfigContent) {
      fs.writeFileSync(
        path.join(destDir, 'config.json'),
        JSON.stringify(mockConfigContent)
      );
    }
    if (mockSystemPrompt !== null) {
      fs.writeFileSync(path.join(destDir, 'systemPrompt.md'), mockSystemPrompt);
    }
    if (mockCreateAssets) {
      const assetsDir = path.join(destDir, 'assets');
      fs.mkdirSync(path.join(assetsDir, 'pose'), { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'avatar.png'), 'fake-avatar');
      fs.writeFileSync(path.join(assetsDir, 'pose/default.png'), 'fake-pose');
    }
    if (mockVoiceSampleFile) {
      fs.writeFileSync(path.join(destDir, mockVoiceSampleFile), 'fake-voice');
    }
    return destDir;
  },
}));

// ─── 导入被测模块 ───────────────────────────────────────────

import { installAgentFromMarketplace } from '../src/marketplace/agent-installer.js';

// ─── 辅助 ───────────────────────────────────────────────────

function makeEntry(folder = 'test-agent'): AgentMarketplaceEntry {
  return {
    name: 'Test Agent',
    description: 'desc',
    author: 'a',
    homepage: 'https://example.com',
    path: `agents/${folder}`,
  };
}

/** 生成一份合法的 config.json 内容 */
function validConfig(): Record<string, unknown> {
  return {
    name: 'Test Agent',
    description: '测试角色',
    defaultModel: { provider: 'deepseek', model: 'deepseek-chat' },
    maxSteps: 30,
  };
}

// ─── 测试 ───────────────────────────────────────────────────

describe('AgentMarketplaceEntrySchema', () => {
  it('accepts a valid entry', () => {
    const entry = makeEntry();
    const result = AgentMarketplaceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('accepts entry with voiceSample', () => {
    const entry = { ...makeEntry(), voiceSample: 'voice-sample.mp3' };
    const result = AgentMarketplaceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('accepts entry without logo', () => {
    const result = AgentMarketplaceEntrySchema.safeParse(makeEntry());
    expect(result.success).toBe(true);
  });
});

describe('installAgentFromMarketplace', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-marketplace-test-'));
    agentsDir = path.join(tempDir, 'agents');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // 每个测试前清空 agents 目录
    fs.rmSync(agentsDir, { recursive: true, force: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    // 重置 mock 控制变量
    mockConfigContent = validConfig();
    mockSystemPrompt = '你是一个测试角色';
    mockCreateAssets = true;
    mockVoiceSampleFile = null;
  });

  it('downloads, parses config, creates agent, and copies assets', async () => {
    const agent = await installAgentFromMarketplace(makeEntry('arona'));

    // 返回了合法的 AgentConfig
    expect(agent.id).toBeTruthy();
    expect(agent.id).toMatch(/^\w{8}-\d{8}-\d{6}$/);
    expect(agent.name).toBe('Test Agent');
    expect(agent.systemPrompt).toBe('你是一个测试角色');

    // assets 复制成功
    const avatarPath = path.join(agentsDir, agent.id, 'assets', 'avatar.png');
    const posePath = path.join(
      agentsDir,
      agent.id,
      'assets',
      'pose',
      'default.png'
    );
    expect(fs.existsSync(avatarPath)).toBe(true);
    expect(fs.existsSync(posePath)).toBe(true);
    expect(fs.readFileSync(avatarPath, 'utf-8')).toBe('fake-avatar');
  });

  it('throws when config.json is missing', async () => {
    mockConfigContent = null;

    await expect(
      installAgentFromMarketplace(makeEntry('no-config'))
    ).rejects.toThrow('missing config.json');
  });

  it('throws when config.json is missing required field', async () => {
    mockConfigContent = {
      name: 'X',
      defaultModel: { provider: 'x', model: 'y' },
    };

    await expect(
      installAgentFromMarketplace(makeEntry('bad-config'))
    ).rejects.toThrow('Invalid agent config');
  });

  it('strips forbidden system fields from config.json', async () => {
    // 模拟作者失误：在 config.json 里写了系统字段
    mockConfigContent = {
      ...validConfig(),
      id: 'should-be-deleted',
      createdAt: 123,
      updatedAt: 456,
      defaultWorkspacePath: '/home/author',
      voiceId: 'voice-123',
      marketplaceSource: 'fake/source',
    };

    const agent = await installAgentFromMarketplace(makeEntry('dirty'));

    // id 是新生成的，不是 config.json 里的
    expect(agent.id).not.toBe('should-be-deleted');
    expect(agent.createdAt).not.toBe(123);
    // 这些字段不应该存在
    expect(agent.defaultWorkspacePath).toBeUndefined();
    expect(agent.voiceId).toBeUndefined();
    // marketplaceSource 被防御性清理后用真实来源覆盖
    expect(agent.marketplaceSource).not.toBe('fake/source');
  });

  it('writes correct marketplaceSource (owner/repo/folder)', async () => {
    const agent = await installAgentFromMarketplace(makeEntry('arona'));

    expect(agent.marketplaceSource).toBe(
      'Code-MonkeyZhang/persona-agent-marketplace/arona'
    );
  });

  it('clears skillNames and mcpNames even if config.json provides them', async () => {
    mockConfigContent = {
      ...validConfig(),
      skillNames: ['some-skill'],
      mcpNames: ['some-mcp'],
    };

    const agent = await installAgentFromMarketplace(makeEntry('with-skills'));

    expect(agent.skillNames).toEqual([]);
    expect(agent.mcpNames).toEqual([]);
  });

  it('copies voice sample when declared in entry', async () => {
    mockVoiceSampleFile = 'voice-sample.mp3';
    const entry = {
      ...makeEntry('with-voice'),
      voiceSample: 'voice-sample.mp3',
    };

    const agent = await installAgentFromMarketplace(entry);

    const voicePath = path.join(agentsDir, agent.id, 'voice-sample.mp3');
    expect(fs.existsSync(voicePath)).toBe(true);
    expect(fs.readFileSync(voicePath, 'utf-8')).toBe('fake-voice');
  });

  it('does not copy voice sample when not declared', async () => {
    mockVoiceSampleFile = 'voice-sample.mp3';
    // entry 没有 voiceSample 字段，即使文件存在于包中也不复制
    const agent = await installAgentFromMarketplace(makeEntry('no-voice'));

    const voicePath = path.join(agentsDir, agent.id, 'voice-sample.mp3');
    expect(fs.existsSync(voicePath)).toBe(false);
  });

  it('cleans up temp directory after success', async () => {
    const beforeCount = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('agent-install-')).length;

    await installAgentFromMarketplace(makeEntry('cleanup-ok'));

    const afterCount = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('agent-install-')).length;

    expect(afterCount).toBe(beforeCount);
  });

  it('cleans up temp directory after failure', async () => {
    mockConfigContent = null;
    const beforeCount = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('agent-install-')).length;

    await expect(
      installAgentFromMarketplace(makeEntry('cleanup-fail'))
    ).rejects.toThrow();

    const afterCount = fs
      .readdirSync(os.tmpdir())
      .filter((f) => f.startsWith('agent-install-')).length;

    expect(afterCount).toBe(beforeCount);
  });
});
