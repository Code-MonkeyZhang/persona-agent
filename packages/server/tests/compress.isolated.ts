/**
 * @fileoverview 上下文压缩集成测试。
 *
 * Mock 策略：
 * - 文件系统：mock paths.js 到临时目录；
 * - LLM：mock llm-single-call.js 的 streamSingleStepOutcome，模块级变量控制返回与抛错；
 * - 广播：mock websocket-server.js 捕获 compression 事件与 error 气泡。
 *
 * 覆盖：滚动更新单份覆盖、批次让步与真底线、重试与失败分类、压缩记录
 * 落库与 summary 抽取、指针失败不动、事件广播、崩溃恢复、当前摘要取数。
 * 运行：`bun test ./tests/compress.isolated.ts`。
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

/** 控制 streamSingleStepOutcome 的行为 */
let mockShouldThrow = false;
let mockErrorClass: 'rate_limit' | 'auth' = 'rate_limit';
let mockSummary = '- 测试摘要';
let mockHanging = false;
let hangingRelease: (() => void) | null = null;
/** 捕获最近一次 LLM 调用的入参 */
let lastTranscript = '';
/** 捕获广播事件 */
let broadcasts: Array<{ sessionId: string; event: { type: string } }> = [];

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

mock.module('../src/agent/llm-single-call.js', () => {
  class StreamCallError extends Error {
    class: string;
    constructor(message: string, errorClass: string) {
      super(message);
      this.class = errorClass;
    }
  }
  return {
    StreamCallError,
    streamSingleStepOutcome: async (
      userMessage: string
    ): Promise<{ text: string; usage: null }> => {
      if (mockHanging) {
        await new Promise<void>((resolve) => {
          hangingRelease = resolve;
        });
      }
      lastTranscript = userMessage;
      if (mockShouldThrow) {
        throw new StreamCallError('mock failure', mockErrorClass);
      }
      return { text: mockSummary, usage: null };
    },
    streamSingleStep: async (): Promise<string> => mockSummary,
  };
});

mock.module('../src/server/websocket-server.js', () => ({
  broadcastToSession: (sessionId: string, event: { type: string }) => {
    broadcasts.push({ sessionId, event });
  },
  broadcastToAll: () => {},
}));

import { SessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/session-manager.js';
import { createAgentConfig } from '../src/agent/index.js';
import type { AgentConfigInput } from '../src/agent/index.js';
import {
  runCompression,
  currentSummary,
  recoverInterruptedCompressions,
} from '../src/server/services/compress-service.js';
import { closeDb, getDb } from '../src/db/index.js';

const defaultModel = { provider: 'openai', model: 'gpt-4' };

function createTestAgentInput(
  overrides: Partial<AgentConfigInput> = {}
): AgentConfigInput {
  return {
    name: 'Test Agent',
    systemPrompt: 'You are a helpful assistant.',
    defaultModel,
    maxSteps: 10,
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
    closeDb();
    rmTempDir(tempDir);
  });

  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
    mockShouldThrow = false;
    mockErrorClass = 'rate_limit';
    mockSummary = '- 测试摘要';
    mockHanging = false;
    hangingRelease = null;
    lastTranscript = '';
    broadcasts = [];
  });

  /** 构造一个带聊天 Session 和若干消息的 SessionManager */
  function setupChatWithMessages(
    messages: Array<{ role: string; content: string }>
  ): { agentId: string; manager: SessionManager; sessionId: string } {
    const agent = createAgentConfig(createTestAgentInput());
    const store = new SessionStore(agent.id);
    const manager = new SessionManager(store, agent.id);
    manager.createChatSession();
    for (const msg of messages) {
      manager.appendMessage(manager.chatSessionId(), msg as never);
    }
    return {
      agentId: agent.id,
      manager,
      sessionId: manager.chatSessionId(),
    };
  }

  /** 两个完整轮次的四条消息 */
  const twoRounds = [
    { role: 'user', content: 'aaaa' },
    { role: 'assistant', content: 'bbbb' },
    { role: 'user', content: 'cccc' },
    { role: 'assistant', content: 'dddd' },
  ];

  const fastOpts = {
    provider: 'openai',
    modelId: 'gpt-4',
    retryDelaysMs: [1, 1, 1],
  };

  describe('批次选择与让步', () => {
    it('手动路径整区不足预算时让步，压掉首个轮次留住最近轮次', async () => {
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      const outcome = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      expect(outcome).toBe('complete');
      const session = manager.getSession(sessionId);
      expect(session?.summarizedUpTo).toBe(2);
      // 摘要只进压缩记录，不再写 compressionSummaries
      expect(session?.compressionSummaries).toBeUndefined();
    });

    it('自动路径整区不足预算时静默跳过不产生记录', async () => {
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      const outcome = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'auto',
        ...fastOpts,
      });

      expect(outcome).toBe('skipped');
      const session = manager.getSession(sessionId);
      expect(session?.compressionLog).toBeUndefined();
      expect(session?.summarizedUpTo).toBeUndefined();
    });

    it('不足两个完整轮次的手动压缩落 no_material，指针不动无气泡', async () => {
      const { manager, sessionId } = setupChatWithMessages([
        { role: 'user', content: 'aaaa' },
        { role: 'assistant', content: 'bbbb' },
      ]);

      const outcome = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      expect(outcome).toBe('failed');
      const session = manager.getSession(sessionId);
      expect(session?.summarizedUpTo).toBeUndefined();
      expect(session?.compressionLog).toHaveLength(1);
      expect(session?.compressionLog?.[0]?.reason).toBe('no_material');
      expect(session?.messages.some((m) => m.role === 'error')).toBe(false);
      expect(
        broadcasts.some((b) => b.event.type === 'compression_failed')
      ).toBe(true);
    });
  });

  describe('滚动更新与记录', () => {
    it('旧摘要进入下一次压缩的输入，新 complete 抽掉旧 summary', async () => {
      mockSummary = '第一份摘要';
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });
      expect(lastTranscript).not.toContain('此前摘要');

      // 追加一轮让未摘要区重新凑足两个轮次
      manager.appendMessage(sessionId, {
        role: 'user',
        content: 'eeee',
      } as never);
      manager.appendMessage(sessionId, {
        role: 'assistant',
        content: 'ffff',
      } as never);
      mockSummary = '第二份摘要';
      await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });
      // 第二次压缩的输入带旧摘要块，滚动合并
      expect(lastTranscript).toContain('此前摘要');
      expect(lastTranscript).toContain('第一份摘要');

      const records = manager.getCompressionRecords(sessionId);
      expect(records).toHaveLength(2);
      expect(records[0]?.summary).toBeUndefined();
      expect(records[1]?.summary).toBe('第二份摘要');
      expect(records[1]?.state).toBe('complete');
    });

    it('complete 事件与 started 事件按节点广播', async () => {
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      const types = broadcasts.map((b) => b.event.type);
      expect(types).toContain('compression_started');
      expect(types).toContain('compression_complete');
    });

    it('老会话无记录时 currentSummary 取旧数组最后一条兜底', () => {
      const { manager, sessionId } = setupChatWithMessages(twoRounds);
      manager.updateCompressionSummaries(sessionId, ['旧一', '旧二']);
      const session = manager.getSession(sessionId)!;
      expect(currentSummary(session)).toBe('旧二');
    });
  });

  describe('失败链', () => {
    it('可重试失败三次耗尽后落 provider，指针不动并落 error 气泡', async () => {
      mockShouldThrow = true;
      mockErrorClass = 'rate_limit';
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      const outcome = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      expect(outcome).toBe('failed');
      const session = manager.getSession(sessionId);
      // 铁律：指针不动，原文不动，只有记录与 error 气泡落库
      expect(session?.summarizedUpTo).toBeUndefined();
      expect(session?.messages).toHaveLength(2 * 2 + 1);
      const record = session?.compressionLog?.[0];
      expect(record?.state).toBe('failed');
      expect(record?.reason).toBe('provider');
      // 一次起算，三次重试后 attempt 到四
      expect(record?.attempt).toBe(4);
      // 终态失败落 error 气泡
      expect(
        session?.messages.some(
          (m) => m.role === 'error' && m.content.includes('上下文压缩失败')
        )
      ).toBe(true);
    });

    it('鉴权失败不重试直接落 provider 终态', async () => {
      mockShouldThrow = true;
      mockErrorClass = 'auth';
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      const record = manager.getSession(sessionId)?.compressionLog?.[0];
      expect(record?.state).toBe('failed');
      expect(record?.reason).toBe('provider');
      expect(record?.attempt).toBe(1);
    });

    it('摘要为空落 bad_summary，指针不动', async () => {
      mockSummary = '   ';
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      const outcome = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });

      expect(outcome).toBe('failed');
      const session = manager.getSession(sessionId);
      expect(session?.summarizedUpTo).toBeUndefined();
      expect(session?.compressionLog?.[0]?.reason).toBe('bad_summary');
    });

    it('压缩进行中重复请求返回 skipped 不重入', async () => {
      mockHanging = true;
      const { manager, sessionId } = setupChatWithMessages(twoRounds);

      const first = runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });
      // 等首次调用进入 LLM 等待态
      await new Promise((resolve) => setTimeout(resolve, 20));

      const second = await runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });
      expect(second).toBe('skipped');

      hangingRelease?.();
      expect(await first).toBe('complete');
    });
  });

  describe('崩溃恢复', () => {
    it('启动恢复把 running 记录改标 interrupted', async () => {
      const { manager, sessionId } = setupChatWithMessages(twoRounds);
      mockHanging = true;
      const pending = runCompression({
        sessionId,
        sessionManager: manager,
        trigger: 'manual',
        ...fastOpts,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      // 悬挂态模拟崩溃：记录落库为 running，进程内状态丢弃
      hangingRelease?.();
      await pending;
      const db = getDb();
      db.query('UPDATE sessions SET compression_log = ? WHERE id = ?').run(
        JSON.stringify([
          {
            id: 'stuck',
            state: 'running',
            trigger: 'manual',
            attempt: 1,
            before: null,
            after: null,
            at: Date.now(),
          },
        ]),
        sessionId
      );

      const recovered = recoverInterruptedCompressions();
      expect(recovered).toBe(1);
      const records = manager.getCompressionRecords(sessionId);
      expect(records[0]?.state).toBe('interrupted');
      expect(records[0]?.reason).toBe('interrupted');
    });

    it('无悬挂记录时恢复零命中且幂等', () => {
      expect(recoverInterruptedCompressions()).toBe(0);
    });
  });
});
