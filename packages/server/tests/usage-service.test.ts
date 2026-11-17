/**
 * @fileoverview usage-service 单元测试。
 *
 * 对账作废路径、底数口径、两轨分子算法、快照拼装、去重推送、刷新与补位落账。
 * 文件系统 mock 到临时目录，SessionManager 走真实 SQLite。
 * 运行：`bun test ./tests/usage-service.test.ts`。
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
import type { Usage } from '@earendil-works/pi-ai';

let tempDir: string;
let agentsDir: string;

/** broadcastToSession 的捕获表，推送出口的广播经 mock 落此处供断言 */
const usageBroadcasts: Array<{ sessionId: string; event: unknown }> = [];

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
  getDbPath: () => path.join(tempDir, 'persona.db'),
}));

mock.module('../src/server/websocket-server.js', () => ({
  broadcastToSession: (sessionId: string, event: unknown) => {
    usageBroadcasts.push({ sessionId, event });
  },
}));

import {
  validateUsage,
  computeNumerator,
  buildSnapshot,
  currentNumerator,
  recordReport,
  recordEstimatedBase,
  updateNetAdjust,
  pushUsageSnapshot,
  forgetUsageSnapshot,
  refreshUsageSnapshot,
  sessionContextSnapshot,
} from '../src/server/services/usage-service.js';
import { SessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/session-manager.js';
import { createAgentConfig } from '../src/agent/index.js';
import type { AgentConfigInput } from '../src/agent/index.js';
import type { Session } from '@persona/shared';
import { closeDb } from '../src/db/index.js';

/** 构造一笔口径一致的 usage */
function makeUsage(overrides: Partial<Usage> = {}): Usage {
  const input = 100;
  const output = 50;
  const cacheRead = 10;
  const cacheWrite = 5;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
    ...overrides,
  };
}

/** 无消息底数的会话骨架 */
function bareSession(usageState?: Session['usageState']): Session {
  return {
    id: 'chat-x',
    agentId: 'a',
    title: 't',
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    usageState,
  };
}

describe('usage-service', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'));
    agentsDir = path.join(tempDir, 'agents');
  });

  afterAll(() => {
    closeDb();
    rmTempDir(tempDir);
  });

  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  describe('validateUsage', () => {
    it('对账通过返回底数口径，input 加缓存读加缓存写', () => {
      expect(validateUsage(makeUsage())).toEqual({ base: 115 });
    });

    it('total 与各项之和对不上整笔作废', () => {
      expect(validateUsage(makeUsage({ totalTokens: 999 }))).toBeNull();
    });

    it('负数与 NaN 字段整笔作废', () => {
      expect(validateUsage(makeUsage({ input: -1 }))).toBeNull();
      expect(validateUsage(makeUsage({ cacheRead: Number.NaN }))).toBeNull();
    });

    it('total 非正整笔作废', () => {
      expect(validateUsage(makeUsage({ totalTokens: 0 }))).toBeNull();
    });
  });

  describe('computeNumerator', () => {
    it('分子等于 base 加锚点后消息估算加净调整', () => {
      const session = bareSession({
        base: 1000,
        anchorSeq: 1,
        netAdjust: -50,
        shares: null,
      });
      session.messages = [
        { role: 'user', content: '锚点前的消息不计入增量' },
        { role: 'user', content: 'abcd' }, // 5
        { role: 'assistant', content: 'efgh' }, // 5
      ];
      // 1000 + 10 - 50
      expect(computeNumerator(session)).toBe(960);
    });

    it('base 缺失返回 null', () => {
      expect(computeNumerator(bareSession())).toBeNull();
      expect(
        computeNumerator(
          bareSession({ base: null, anchorSeq: 0, netAdjust: 0, shares: null })
        )
      ).toBeNull();
    });

    it('底数带装配时先减报数时装配再加现行装配', () => {
      const session = bareSession({
        base: 1000,
        anchorSeq: 0,
        netAdjust: 0,
        shares: null,
        assemblyTokens: 300,
      });
      // 1000 - 300 + 150
      expect(computeNumerator(session, 150)).toBe(850);
    });

    it('currentAssemblyTokens 缺省修正归零等价旧公式', () => {
      const session = bareSession({
        base: 1000,
        anchorSeq: 0,
        netAdjust: 0,
        shares: null,
        assemblyTokens: 300,
      });
      expect(computeNumerator(session)).toBe(1000);
    });

    it('底数未记装配时现行装配不参与修正', () => {
      const session = bareSession({
        base: 1000,
        anchorSeq: 0,
        netAdjust: 0,
        shares: null,
      });
      expect(computeNumerator(session, 150)).toBe(1000);
    });

    it('负数分子钳制到零', () => {
      const session = bareSession({
        base: 100,
        anchorSeq: 0,
        netAdjust: -200,
        shares: null,
        assemblyTokens: 50,
      });
      // 100 - 50 + 10 - 200 为负，钳制为零
      session.messages = [{ role: 'user', content: 'abcd' }];
      expect(computeNumerator(session, 10)).toBe(0);
    });
  });

  describe('currentNumerator 两轨选择', () => {
    it('有底数走真实轨带修正，无底数走估算轨', () => {
      const withBase = bareSession({
        base: 1000,
        anchorSeq: 0,
        netAdjust: 0,
        shares: null,
        assemblyTokens: 100,
      });
      expect(currentNumerator(withBase, 300)).toBe(1200);
      const noBase = bareSession();
      noBase.messages = [{ role: 'user', content: 'abcd' }]; // 5
      expect(currentNumerator(noBase, 300)).toBe(305);
    });

    it('base 为 null 的存量底数同样走估算轨', () => {
      const session = bareSession({
        base: null,
        anchorSeq: 0,
        netAdjust: -30,
        shares: null,
      });
      session.messages = [{ role: 'user', content: 'abcd' }];
      expect(currentNumerator(session, 100)).toBe(105);
    });
  });

  describe('buildSnapshot', () => {
    it('分子分母齐全返回快照并携带分段', () => {
      const session = bareSession({
        base: 400,
        anchorSeq: 0,
        netAdjust: 0,
        shares: { messages: 300, systemPersona: 60, toolsSkills: 40 },
      });
      expect(buildSnapshot(session, 1000)).toEqual({
        used: 400,
        window: 1000,
        shares: { messages: 300, systemPersona: 60, toolsSkills: 40 },
      });
    });

    it('分子缺失返回 null', () => {
      expect(buildSnapshot(bareSession(), 1000)).toBeNull();
    });
  });

  describe('recordReport 与 updateNetAdjust 落库', () => {
    function setup(): SessionManager {
      const input: AgentConfigInput = {
        name: 'Test Agent',
        systemPrompt: 'p',
        defaultModel: { provider: 'openai', model: 'gpt-4' },
        maxSteps: 10,
        skillNames: [],
      };
      const agent = createAgentConfig(input);
      const store = new SessionStore(agent.id);
      const manager = new SessionManager(store, agent.id);
      manager.createChatSession();
      manager.appendMessage(manager.chatSessionId(), {
        role: 'user',
        content: 'abcd',
      });
      return manager;
    }

    it('报数落账写 usage_state 并清零净调整', async () => {
      const manager = setup();
      const sessionId = manager.chatSessionId();
      updateNetAdjust(sessionId, manager, -80);

      const snapshot = recordReport({
        sessionId,
        sessionManager: manager,
        base: 900,
        anchorSeq: 1,
        shares: { messages: 700, systemPersona: 150, toolsSkills: 50 },
        contextWindow: 2000,
      });

      expect(snapshot).toEqual({
        used: 900,
        window: 2000,
        shares: { messages: 700, systemPersona: 150, toolsSkills: 50 },
      });
      const session = manager.getSession(sessionId);
      expect(session?.usageState).toEqual({
        base: 900,
        anchorSeq: 1,
        netAdjust: 0,
        shares: { messages: 700, systemPersona: 150, toolsSkills: 50 },
        assemblyTokens: 200,
      });
    });

    it('shares 为 null 时装配字段留空', () => {
      const manager = setup();
      const sessionId = manager.chatSessionId();
      recordReport({
        sessionId,
        sessionManager: manager,
        base: 900,
        anchorSeq: 1,
        shares: null,
        contextWindow: 2000,
      });
      const state = manager.getSession(sessionId)?.usageState;
      expect(state?.assemblyTokens).toBeUndefined();
    });

    it('压缩净调整叠加在现有底数上', () => {
      const manager = setup();
      const sessionId = manager.chatSessionId();
      recordReport({
        sessionId,
        sessionManager: manager,
        base: 900,
        anchorSeq: 1,
        shares: null,
        contextWindow: 2000,
      });
      updateNetAdjust(sessionId, manager, -120);
      updateNetAdjust(sessionId, manager, 30);
      expect(manager.getSession(sessionId)?.usageState?.netAdjust).toBe(-90);
    });
  });

  describe('recordEstimatedBase 补位落账', () => {
    it('底数等于三段合计，净调整清零，锚点等于消息条数', () => {
      const input: AgentConfigInput = {
        name: 'Test Agent',
        systemPrompt: 'p',
        defaultModel: { provider: 'openai', model: 'gpt-4' },
        maxSteps: 10,
        skillNames: [],
      };
      const agent = createAgentConfig(input);
      const store = new SessionStore(agent.id);
      const manager = new SessionManager(store, agent.id);
      manager.createChatSession();
      const sessionId = manager.chatSessionId();
      manager.appendMessage(sessionId, { role: 'user', content: 'abcd' });

      const snapshot = recordEstimatedBase({
        sessionId,
        sessionManager: manager,
        shares: { messages: 400, systemPersona: 100, toolsSkills: 50 },
        contextWindow: 2000,
      });

      expect(snapshot).toEqual({
        used: 550,
        window: 2000,
        shares: { messages: 400, systemPersona: 100, toolsSkills: 50 },
      });
      expect(manager.getSession(sessionId)?.usageState).toEqual({
        base: 550,
        anchorSeq: 1,
        netAdjust: 0,
        shares: { messages: 400, systemPersona: 100, toolsSkills: 50 },
        assemblyTokens: 150,
      });
    });
  });

  describe('pushUsageSnapshot 去重', () => {
    it('相同快照不重复广播，变了才广播一次', () => {
      const before = usageBroadcasts.length;
      const snapshot = {
        used: 100,
        window: 1000,
        shares: { messages: 50, systemPersona: 30, toolsSkills: 20 },
      };
      expect(pushUsageSnapshot('dedupe-s1', snapshot, 'estimate')).toBe(true);
      expect(pushUsageSnapshot('dedupe-s1', snapshot, 'model')).toBe(false);
      expect(
        pushUsageSnapshot('dedupe-s1', { ...snapshot, used: 120 }, 'model')
      ).toBe(true);
      expect(usageBroadcasts.length - before).toBe(2);
    });

    it('清理内存表后相同快照重新可推', () => {
      const snapshot = {
        used: 100,
        window: 1000,
        shares: { messages: 50, systemPersona: 30, toolsSkills: 20 },
      };
      pushUsageSnapshot('dedupe-s2', snapshot, 'estimate');
      forgetUsageSnapshot('dedupe-s2');
      expect(pushUsageSnapshot('dedupe-s2', snapshot, 'estimate')).toBe(true);
      forgetUsageSnapshot('dedupe-s2');
    });
  });

  describe('sessionContextSnapshot 与 refreshUsageSnapshot 集成', () => {
    function setupAgent(defaultModel = { provider: 'openai', model: 'gpt-4o' }) {
      const input: AgentConfigInput = {
        name: 'Test Agent',
        systemPrompt: 'p',
        defaultModel,
        maxSteps: 10,
        skillNames: [],
      };
      const agent = createAgentConfig(input);
      const store = new SessionStore(agent.id);
      const manager = new SessionManager(store, agent.id);
      manager.createChatSession();
      const sessionId = manager.chatSessionId();
      manager.appendMessage(sessionId, { role: 'user', content: 'abcd' });
      return { manager, sessionId };
    }

    it('无底数走估算轨，窗口取 Agent 默认模型解析', () => {
      const { manager, sessionId } = setupAgent();
      const snapshot = sessionContextSnapshot(manager, sessionId);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.window).toBe(128000);
      expect(snapshot!.used).toBeGreaterThan(0);
      expect(snapshot!.shares!.systemPersona).toBeGreaterThan(0);
      expect(snapshot!.shares!.toolsSkills).toBeGreaterThan(0);
    });

    it('模型查不到注册表返回 null', () => {
      const { manager, sessionId } = setupAgent({
        provider: 'openai',
        model: 'no-such-model',
      });
      expect(sessionContextSnapshot(manager, sessionId)).toBeNull();
    });

    it('refreshUsageSnapshot 推估算快照且不落库，重复刷新被去重', () => {
      const { manager, sessionId } = setupAgent();
      const before = usageBroadcasts.length;
      refreshUsageSnapshot(sessionId, manager, 'test');
      expect(usageBroadcasts.length - before).toBe(1);
      refreshUsageSnapshot(sessionId, manager, 'test');
      expect(usageBroadcasts.length - before).toBe(1);
      expect(manager.getSession(sessionId)?.usageState).toBeUndefined();
    });

    it('有底数刷新走真实轨带装配修正', () => {
      const { manager, sessionId } = setupAgent();
      recordReport({
        sessionId,
        sessionManager: manager,
        base: 100000,
        anchorSeq: 1,
        shares: { messages: 99000, systemPersona: 800, toolsSkills: 200 },
        contextWindow: 128000,
      });
      const before = usageBroadcasts.length;
      refreshUsageSnapshot(sessionId, manager, 'test');
      expect(usageBroadcasts.length - before).toBe(1);
      const broadcast = usageBroadcasts[before]!;
      expect(broadcast.event).toMatchObject({
        type: 'context_usage',
        sessionId,
        window: 128000,
        source: 'estimate',
      });
      const used = (broadcast.event as { used: number }).used;
      // 100000 减报数时装配 1000 加现行装配，现行装配为真实链现算
      expect(used).toBeGreaterThan(99000);
      expect(used).toBeLessThan(104000);
    });
  });
});
