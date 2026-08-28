/**
 * @fileoverview 初始 Agent 播种器测试
 *
 * 覆盖（设计文档 §8）：
 * - zh / en 双档案播种（身份、voiceId 保留、状态文件字段齐全）
 * - 状态文件已标记 → 不播种；agents 非空 → 不播种；env 缺失 → 不播种
 * - 模板损坏（config 非法 / 档案目录缺失）→ log 降级不阻塞
 * - 播种后目录结构完整（config.json / systemPrompt.md / 英文 pose / 状态文件）
 * - 状态文件损坏（非法 json）→ 视同未播种，agents 为空时重播
 *
 * Mock 策略（与 agent-marketplace.test.ts 对齐）：
 * - paths.ts → 指向临时目录（seeder 与 createAgentConfig 用到的全部 path helper）
 * - logger.ts → 静音
 * fixture 指向真实模板目录 packages/server/templates，顺带验证模板数据。
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ─── 临时目录 ───────────────────────────────────────────────

let tempDir: string;
let agentsDir: string;
let seedStatusPath: string;

/** 真实模板目录（fixture） */
const realTemplatesDir = path.resolve(import.meta.dir, '../templates');

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
  getWorkspaceDir: () => path.join(tempDir, 'workspace'),
  getAgentSeedStatusPath: () => seedStatusPath,
  // 以下给同进程的其他测试文件用
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

const { seedInitialAgent, readAgentSeedStatus } = await import(
  '../src/agent/agent-seeder.js'
);

/** 备份并清理 env，保证测试间互不污染 */
const savedTemplateDir = process.env['PERSONA_AGENT_TEMPLATE_DIR'];
const savedLang = process.env['PERSONA_AGENT_LANG'];

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-seeder-test-'));
  agentsDir = path.join(tempDir, 'agents');
  seedStatusPath = path.join(tempDir, 'config', 'agent-seed.json');
});

afterAll(() => {
  process.env['PERSONA_AGENT_TEMPLATE_DIR'] = savedTemplateDir;
  process.env['PERSONA_AGENT_LANG'] = savedLang;
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(agentsDir, { recursive: true, force: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.rmSync(path.dirname(seedStatusPath), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(seedStatusPath), { recursive: true });
  process.env['PERSONA_AGENT_TEMPLATE_DIR'] = realTemplatesDir;
  process.env['PERSONA_AGENT_LANG'] = 'zh-CN';
});

describe('agent-seeder', () => {
  it('seeds zh-CN profile when agents empty and no status file', () => {
    seedInitialAgent();

    const status = readAgentSeedStatus();
    expect(status.seeded).toBe(true);
    expect(status.template).toBe('arona-adult');
    expect(status.lang).toBe('zh-CN');
    expect(status.agentId).toBeTruthy();
    expect(typeof status.seededAt).toBe('number');

    const agentDir = path.join(agentsDir, status.agentId!);
    const config = JSON.parse(
      fs.readFileSync(path.join(agentDir, 'config.json'), 'utf-8')
    );
    expect(config.name).toBe('阿罗娜');
    expect(config.voiceId).toBe('Chinese (Mandarin)_Gentle_Senior');
    expect(config.voiceLanguage).toBe('zh');
    const prompt = fs.readFileSync(
      path.join(agentDir, 'systemPrompt.md'),
      'utf-8'
    );
    expect(prompt).toContain('阿罗娜');
    expect(prompt).toContain('## 不要做的事');
  });

  it('seeds en profile when PERSONA_AGENT_LANG=en', () => {
    process.env['PERSONA_AGENT_LANG'] = 'en';
    seedInitialAgent();

    const status = readAgentSeedStatus();
    expect(status.seeded).toBe(true);
    expect(status.lang).toBe('en');

    const agentDir = path.join(agentsDir, status.agentId!);
    const config = JSON.parse(
      fs.readFileSync(path.join(agentDir, 'config.json'), 'utf-8')
    );
    expect(config.name).toBe('Arona');
    expect(config.voiceLanguage).toBe('en');
    const prompt = fs.readFileSync(
      path.join(agentDir, 'systemPrompt.md'),
      'utf-8'
    );
    expect(prompt).toContain('## Do not');
  });

  it('does not seed when status file marks seeded', () => {
    seedInitialAgent();
    const first = readAgentSeedStatus();

    seedInitialAgent();

    // 只播种一次，agentId 不变
    expect(readAgentSeedStatus().agentId).toBe(first.agentId);
    const entries = fs.readdirSync(agentsDir);
    expect(entries.length).toBe(1);
  });

  it('does not seed when agents directory is not empty', () => {
    // 预置一个已存在的 Agent（config.json 最小可解析形态由 getAgentConfig 校验）
    const existingDir = path.join(agentsDir, 'existing-agent');
    fs.mkdirSync(existingDir, { recursive: true });
    const now = Date.now();
    fs.writeFileSync(
      path.join(existingDir, 'config.json'),
      JSON.stringify({
        id: 'existing-agent',
        name: 'existing',
        systemPrompt: 'p',
        defaultModel: { provider: 'x', model: 'y' },
        maxSteps: 30,
        createdAt: now,
        updatedAt: now,
      })
    );

    seedInitialAgent();

    expect(readAgentSeedStatus().seeded).toBe(false);
    expect(fs.readdirSync(agentsDir).length).toBe(1);
  });

  it('does not seed when PERSONA_AGENT_TEMPLATE_DIR is missing', () => {
    delete process.env['PERSONA_AGENT_TEMPLATE_DIR'];
    seedInitialAgent();

    expect(readAgentSeedStatus().seeded).toBe(false);
    expect(fs.readdirSync(agentsDir).length).toBe(0);
  });

  it('degrades silently when template config is corrupt', () => {
    // 自建损坏模板：config.json 非法
    const badDir = path.join(tempDir, 'bad-templates');
    const profileDir = path.join(badDir, 'arona-adult', 'zh-CN');
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, 'config.json'), 'not-json{');
    fs.writeFileSync(path.join(profileDir, 'systemPrompt.md'), 'p');
    process.env['PERSONA_AGENT_TEMPLATE_DIR'] = badDir;

    expect(() => seedInitialAgent()).not.toThrow();
    expect(readAgentSeedStatus().seeded).toBe(false);
  });

  it('degrades silently when profile directory is missing', () => {
    const emptyDir = path.join(tempDir, 'empty-templates');
    fs.mkdirSync(emptyDir, { recursive: true });
    process.env['PERSONA_AGENT_TEMPLATE_DIR'] = emptyDir;

    expect(() => seedInitialAgent()).not.toThrow();
    expect(readAgentSeedStatus().seeded).toBe(false);
  });

  it('creates complete directory structure with english pose names', () => {
    seedInitialAgent();

    const status = readAgentSeedStatus();
    const agentDir = path.join(agentsDir, status.agentId!);

    expect(fs.existsSync(path.join(agentDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(agentDir, 'systemPrompt.md'))).toBe(true);
    expect(fs.existsSync(path.join(agentDir, 'assets', 'avatar.png'))).toBe(
      true
    );
    expect(
      fs.existsSync(
        path.join(agentDir, 'assets', 'backgrounds', 'background.png')
      )
    ).toBe(true);

    const poses = fs.readdirSync(path.join(agentDir, 'assets', 'pose'));
    expect(poses.length).toBe(26);
    // 英文文件名抽查（default 不改名 + 两个映射名）
    expect(poses).toContain('default.png');
    expect(poses).toContain('friendly.png');
    expect(poses).toContain('gentle.png');
    // 不残留中文文件名
    expect(poses.some((f) => /[\u4e00-\u9fff]/.test(f))).toBe(false);
  });

  it('treats corrupt status file as not seeded and reseeds', () => {
    fs.mkdirSync(path.dirname(seedStatusPath), { recursive: true });
    fs.writeFileSync(seedStatusPath, 'corrupt-json{');

    seedInitialAgent();

    expect(readAgentSeedStatus().seeded).toBe(true);
    expect(fs.readdirSync(agentsDir).length).toBe(1);
  });
});
