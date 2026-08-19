/**
 * @fileoverview workspace.ts 工作目录解析与写回单元测试
 * 覆盖解析顺序、可用性校验、失效回退、默认目录自动创建与配置写回
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  mock,
} from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时目录路径 */
let tempDir: string;
/** Agent 配置存储目录 */
let agentsDir: string;
/** 默认工作空间路径 */
let workspaceDir: string;

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => agentsDir,
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentSessionsDir: (id: string) => path.join(agentsDir, id, 'sessions'),
  getWorkspaceDir: () => workspaceDir,
}));

import {
  resolveWorkspaceDir,
  persistResolvedWorkspace,
} from '../src/agent/workspace.js';
import {
  createAgentConfig,
  AgentConfigSchema,
} from '../src/agent/index.js';
import type { AgentConfigInput } from '../src/agent/index.js';
import type { SessionManager } from '../src/session/index.js';
import type { Session } from '../src/session/types.js';

/** 构造最小会话对象 */
function makeSession(workspacePath?: string): Session {
  return {
    id: 'session-1',
    agentId: 'agent-1',
    title: 'test',
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    workspacePath,
    model: { provider: 'openai', model: 'gpt-4o' },
  };
}

/** 构造指定默认工作空间的 Agent 配置 */
function makeAgentConfig(defaultWorkspacePath?: string) {
  return AgentConfigSchema.parse({
    id: 'agent-1',
    name: 'Test Agent',
    systemPrompt: 'prompt',
    defaultModel: { provider: 'openai', model: 'gpt-4o' },
    maxSteps: 10,
    defaultWorkspacePath,
    createdAt: 0,
    updatedAt: 0,
  });
}

/** 记录 updateWorkspacePath 调用的 SessionManager 替身 */
function makeSessionManagerSpy() {
  const calls: Array<{ sessionId: string; path: string }> = [];
  const stub = {
    updateWorkspacePath: (sessionId: string, workspacePath: string) => {
      calls.push({ sessionId, path: workspacePath });
      return null;
    },
  };
  return { manager: stub as unknown as SessionManager, calls };
}

describe('resolveWorkspaceDir', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-test-'));
    agentsDir = path.join(tempDir, 'agents');
    workspaceDir = path.join(tempDir, 'workspace');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** 每个用例独立的候选目录 */
  let candidates: string[] = [];
  function makeDir(name: string): string {
    const dir = path.join(tempDir, name);
    fs.mkdirSync(dir, { recursive: true });
    candidates.push(dir);
    return dir;
  }
  beforeEach(() => {
    candidates = [];
  });
  afterEach(() => {
    for (const dir of candidates) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should use session workspace when usable', () => {
    const sessionDir = makeDir('session-ws');

    const result = resolveWorkspaceDir(
      makeSession(sessionDir),
      makeAgentConfig()
    );

    expect(result.dir).toBe(sessionDir);
    expect(result.invalid).toEqual([]);
  });

  it('should record invalid session path and fall back to agent default', () => {
    const agentDir = makeDir('agent-ws');
    const gonePath = path.join(tempDir, 'gone');

    const result = resolveWorkspaceDir(
      makeSession(gonePath),
      makeAgentConfig(agentDir)
    );

    expect(result.dir).toBe(agentDir);
    expect(result.invalid).toEqual([{ source: 'session', path: gonePath }]);
  });

  it('should record both invalid layers and fall back to default workspace', () => {
    const goneSession = path.join(tempDir, 'gone-1');
    const goneAgent = path.join(tempDir, 'gone-2');

    const result = resolveWorkspaceDir(
      makeSession(goneSession),
      makeAgentConfig(goneAgent)
    );

    expect(result.dir).toBe(workspaceDir);
    expect(fs.statSync(workspaceDir).isDirectory()).toBe(true);
    expect(result.invalid).toEqual([
      { source: 'session', path: goneSession },
      { source: 'agent', path: goneAgent },
    ]);
  });

  it('should treat a file path as invalid', () => {
    const filePath = path.join(tempDir, 'not-a-dir.txt');
    fs.writeFileSync(filePath, 'x');
    const agentDir = makeDir('agent-ws-2');

    const result = resolveWorkspaceDir(
      makeSession(filePath),
      makeAgentConfig(agentDir)
    );

    expect(result.dir).toBe(agentDir);
    expect(result.invalid).toEqual([{ source: 'session', path: filePath }]);
    fs.unlinkSync(filePath);
  });
});

describe('persistResolvedWorkspace', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-persist-test-'));
    agentsDir = path.join(tempDir, 'agents');
    workspaceDir = path.join(tempDir, 'workspace');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    fs.rmSync(agentsDir, { recursive: true, force: true });
  });

  /** 创建真实 Agent 供写回落盘验证 */
  function createAgent(): string {
    const input: AgentConfigInput = {
      name: 'Test Agent',
      systemPrompt: 'prompt',
      defaultModel: { provider: 'openai', model: 'gpt-4o' },
      maxSteps: 10,
    };
    return createAgentConfig(input).id;
  }

  it('should write resolved dir back to agent config', () => {
    const agentId = createAgent();
    const resolved = {
      dir: workspaceDir,
      invalid: [{ source: 'agent' as const, path: '/gone' }],
    };

    persistResolvedWorkspace(
      resolved,
      agentId,
      'session-1',
      makeSessionManagerSpy().manager
    );

    const saved = JSON.parse(
      fs.readFileSync(path.join(agentsDir, agentId, 'config.json'), 'utf8')
    ) as { defaultWorkspacePath?: string };
    expect(saved.defaultWorkspacePath).toBe(workspaceDir);
  });

  it('should write resolved dir back to session workspace', () => {
    const agentId = createAgent();
    const spy = makeSessionManagerSpy();
    const resolved = {
      dir: workspaceDir,
      invalid: [{ source: 'session' as const, path: '/gone' }],
    };

    persistResolvedWorkspace(resolved, agentId, 'session-9', spy.manager);

    expect(spy.calls).toEqual([{ sessionId: 'session-9', path: workspaceDir }]);
  });

  it('should persist both layers when both invalid', () => {
    const agentId = createAgent();
    const spy = makeSessionManagerSpy();
    const resolved = {
      dir: workspaceDir,
      invalid: [
        { source: 'session' as const, path: '/gone-s' },
        { source: 'agent' as const, path: '/gone-a' },
      ],
    };

    persistResolvedWorkspace(resolved, agentId, 'session-1', spy.manager);

    const saved = JSON.parse(
      fs.readFileSync(path.join(agentsDir, agentId, 'config.json'), 'utf8')
    ) as { defaultWorkspacePath?: string };
    expect(saved.defaultWorkspacePath).toBe(workspaceDir);
    expect(spy.calls).toEqual([{ sessionId: 'session-1', path: workspaceDir }]);
  });

  it('should not persist anything when nothing invalid', () => {
    const agentId = createAgent();
    const before = fs.readFileSync(
      path.join(agentsDir, agentId, 'config.json'),
      'utf8'
    );
    const spy = makeSessionManagerSpy();

    persistResolvedWorkspace(
      { dir: workspaceDir, invalid: [] },
      agentId,
      'session-1',
      spy.manager
    );

    const after = fs.readFileSync(
      path.join(agentsDir, agentId, 'config.json'),
      'utf8'
    );
    expect(after).toBe(before);
    expect(spy.calls).toEqual([]);
  });
});
