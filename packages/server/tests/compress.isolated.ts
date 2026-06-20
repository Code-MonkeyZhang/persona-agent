/**
 * @fileoverview 上下文压缩集成测试（独立运行，避免 pi-ai mock 污染其它测试）。
 *
 * Mock 策略：
 * - 文件系统：mock paths.js 到临时目录（含 getAgentMemoryDir）；
 * - LLM：mock llm-single-call.js 的 streamSingleTurn，用模块级变量控制返回/抛错。
 *
 * 覆盖：MemoryStore 往返、压缩触发/no-op/批次推进、[RAW] 兜底。
 * 运行：`bun test ./tests/compress.isolated.ts`（已在 package.json test 脚本追加）。
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

/** 控制 streamSingleTurn 的行为：是否抛错、返回的摘要文本 */
let mockShouldThrow = false;
let mockSummary = '[durable] 测试摘要';

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
    _systemPrompt: string,
  ): Promise<string> => {
    if (mockShouldThrow) throw new Error('mock LLM failure');
    return mockSummary;
  },
}));

import { SessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/session-manager.js';
import { createAgentConfig } from '../src/agent/index.js';
import type { AgentConfigInput } from '../src/agent/index.js';
import { MemoryStore } from '../src/agent/memory/memory-store.js';
import { runCompression } from '../src/server/services/compress-service.js';

const defaultModel = { provider: 'openai', model: 'gpt-4' };

function createTestAgentInput(
  overrides: Partial<AgentConfigInput> = {},
): AgentConfigInput {
  return {
    name: 'Test Agent',
    systemPrompt: 'You are a helpful assistant.',
    defaultModel,
    maxSteps: 10,
    mcpNames: [],
    skillNames: [],
    ...overrides,
  };
}

describe('Compression Integration', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-test-'));
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
    mockSummary = '[durable] 测试摘要';
  });

  describe('MemoryStore', () => {
    it('appendHistory / readHistory 往返，getDreamCursor 默认 0', () => {
      const agent = createAgentConfig(createTestAgentInput());
      const store = new MemoryStore(agent.id);

      expect(store.getDreamCursor()).toBe(0);

      store.appendHistory({ cursor: 2, timestamp: 1, content: 'A' });
      store.appendHistory({ cursor: 4, timestamp: 2, content: 'B' });

      const all = store.readHistory(0);
      expect(all).toHaveLength(2);
      expect(all[0]?.content).toBe('A');
      expect(all[1]?.cursor).toBe(4);

      // fromIndex 跳过已整理条目
      expect(store.readHistory(1)).toHaveLength(1);
      expect(store.readHistory(1)[0]?.content).toBe('B');
    });
  });

  describe('runCompression', () => {
    /** 构造一个带聊天 Session 和若干消息的 SessionManager */
    function setupChatWithMessages(
      messages: Array<{ role: string; content: string }>,
    ): { agentId: string; manager: SessionManager } {
      const agent = createAgentConfig(createTestAgentInput());
      const store = new SessionStore(agent.id);
      const manager = new SessionManager(store, agent.id);
      manager.createChatSession();
      for (const msg of messages) {
        manager.appendMessage(manager.chatSessionId(), msg as never);
      }
      return { agentId: agent.id, manager };
    }

    it('未超阈值时为 no-op：不写 history、不推进指针', async () => {
      const { agentId, manager } = setupChatWithMessages([
        { role: 'user', content: 'aaaa' },
        { role: 'assistant', content: 'bbbb' },
      ]);

      await runCompression({
        agentId,
        sessionId: manager.chatSessionId(),
        sessionManager: manager,
        threshold: 50,
        contextWindow: 100000, // 极大窗口，绝不触发
        provider: 'openai',
        modelId: 'gpt-4',
      });

      const session = manager.getSession(manager.chatSessionId());
      expect(session?.summarizedUpTo).toBeUndefined();
      expect(new MemoryStore(agentId).readHistory(0)).toHaveLength(0);
    });

    it('超阈值时压缩：写一条 history、推进 summarizedUpTo', async () => {
      // 4 条消息估算 token 分别为 3/4/3/4，总计 14
      const { agentId, manager } = setupChatWithMessages([
        { role: 'user', content: 'aaaa' },
        { role: 'assistant', content: 'bbbb' },
        { role: 'user', content: 'cccc' },
        { role: 'assistant', content: 'dddd' },
      ]);

      await runCompression({
        agentId,
        sessionId: manager.chatSessionId(),
        sessionManager: manager,
        threshold: 10, // triggerTokens = 10；14 > 10 触发；excess=4 → 压缩第一批(2条)
        contextWindow: 100,
        provider: 'openai',
        modelId: 'gpt-4',
      });

      const session = manager.getSession(manager.chatSessionId());
      expect(session?.summarizedUpTo).toBe(2);

      const entries = new MemoryStore(agentId).readHistory(0);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.cursor).toBe(2);
      expect(entries[0]?.content).toBe(mockSummary);
    });

    it('LLM 失败时用 [RAW] 兜底，指针仍推进', async () => {
      mockShouldThrow = true;
      const { agentId, manager } = setupChatWithMessages([
        { role: 'user', content: 'aaaa' },
        { role: 'assistant', content: 'bbbb' },
        { role: 'user', content: 'cccc' },
        { role: 'assistant', content: 'dddd' },
      ]);

      await runCompression({
        agentId,
        sessionId: manager.chatSessionId(),
        sessionManager: manager,
        threshold: 10,
        contextWindow: 100,
        provider: 'openai',
        modelId: 'gpt-4',
      });

      const session = manager.getSession(manager.chatSessionId());
      expect(session?.summarizedUpTo).toBe(2);

      const entries = new MemoryStore(agentId).readHistory(0);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.cursor).toBe(2);
      expect(entries[0]?.content.startsWith('[RAW]')).toBe(true);
    });
  });
});
