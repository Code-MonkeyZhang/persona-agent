/**
 * @fileoverview 占用刷新信号通路集成测试。
 *
 * 先建两个 Agent 与会话再动态引入 http-server，让它的 initSessionManagers
 * 收到全部 Agent，经真实订阅通路驱动 agents_invalidated 与 tools_invalidated
 * 与 session_updated 与 session_deleted 四类信号，断言快照推送与去重与
 * 按主语圈定与防抖收集与清理行为。
 * mock.module 隔离 websocket-server，独立进程运行。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { rmTempDir } from './temp-cleanup.js';

let tempDir: string;
let agentsDir: string;

const broadcasts: Array<{ sessionId: string; event: unknown }> = [];

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
    broadcasts.push({ sessionId, event });
  },
  broadcastToAll: () => {},
  setViewedHandler: () => {},
  setContextUsageProvider: () => {},
  initWebSocket: () => ({}),
  isWebSocketInitialized: () => true,
}));

import { emitSessionChange, emitToolsInvalidated } from '../src/session/changes.js';
import type { SessionChange } from '@persona/shared';
import { createAgentConfig } from '../src/agent/index.js';
import { SessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/session-manager.js';
import { closeDb } from '../src/db/index.js';

describe('占用刷新信号通路', () => {
  let manager: SessionManager;
  let sessionId: string;
  let bManager: SessionManager;
  let bSessionId: string;
  let agentAId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-signal-'));
    agentsDir = path.join(tempDir, 'agents');
    const agent = createAgentConfig({
      name: 'Signal Agent',
      systemPrompt: 'p',
      defaultModel: { provider: 'openai', model: 'gpt-4o' },
      maxSteps: 10,
      skillNames: [],
    });
    agentAId = agent.id;
    const store = new SessionStore(agent.id);
    manager = new SessionManager(store, agent.id);
    manager.createChatSession();
    sessionId = manager.chatSessionId();
    manager.appendMessage(sessionId, { role: 'user', content: '你好世界' });
    const agentB = createAgentConfig({
      name: 'Signal Agent B',
      systemPrompt: 'p',
      defaultModel: { provider: 'openai', model: 'gpt-4o' },
      maxSteps: 10,
      skillNames: [],
    });
    bManager = new SessionManager(new SessionStore(agentB.id), agentB.id);
    bManager.createChatSession();
    bSessionId = bManager.chatSessionId();
    bManager.appendMessage(bSessionId, {
      role: 'user',
      content: 'B 会话的初始消息',
    });
    // 动态引入让订阅注册发生在全部 Agent 就位之后
    await import('../src/server/http-server.js');
  });

  afterAll(() => {
    closeDb();
    rmTempDir(tempDir);
  });

  function emit(
    kind: SessionChange['kind'],
    sid: string | null,
    data: unknown = {}
  ): void {
    emitSessionChange({
      seq: 0,
      kind,
      sessionId: sid,
      data,
      createdAt: Date.now(),
    });
  }

  function usagePushesSince(before: number) {
    return broadcasts
      .slice(before)
      .filter((b) => (b.event as { type: string }).type === 'context_usage');
  }

  it('agents_invalidated 刷全部会话并推估算快照', () => {
    const before = broadcasts.length;
    emit('agents_invalidated', null);
    const pushed = usagePushesSince(before);
    expect(pushed.length).toBeGreaterThanOrEqual(1);
    const own = pushed.find((b) => b.sessionId === sessionId);
    expect(own).toBeDefined();
    const event = own!.event as {
      used: number;
      window: number;
      source: string;
    };
    expect(event.used).toBeGreaterThan(0);
    expect(event.window).toBe(128000);
    expect(event.source).toBe('estimate');
  });

  it('session_updated 数字未变被去重不推送', () => {
    const before = broadcasts.length;
    emit('session_updated', sessionId);
    expect(usagePushesSince(before).length).toBe(0);
  });

  it('消息增长后的 session_updated 推出一次新数字', () => {
    const before = broadcasts.length;
    manager.appendMessage(sessionId, {
      role: 'assistant',
      content: '这是一条足够长的回复用来抬高估算分子',
    });
    emit('session_updated', sessionId);
    expect(usagePushesSince(before).length).toBe(1);
  });

  it('带归属的失效信号只圈定对应 Agent，其他 Agent 的陈旧数字不推', () => {
    // B 会话消息增长后估算分子已变，刷新被圈定在 A，B 保持陈旧不推
    bManager.appendMessage(bSessionId, {
      role: 'assistant',
      content: 'B 会话的增长消息，抬高估算分子制造陈旧差',
    });
    const before = broadcasts.length;
    emit('agents_invalidated', null, { agentId: agentAId });
    emit('tools_invalidated', null, { agentIds: [agentAId] });
    expect(usagePushesSince(before).length).toBe(0);
  });

  it('data 为空的全局信号兜底刷全部，B 的陈旧数字此刻推出', () => {
    const before = broadcasts.length;
    emit('tools_invalidated', null);
    const pushed = usagePushesSince(before);
    expect(pushed.length).toBe(1);
    expect(pushed[0]!.sessionId).toBe(bSessionId);
  });

  it('分配落盘的防抖收集走真实链路圈定 A', async () => {
    manager.appendMessage(sessionId, {
      role: 'assistant',
      content: 'A 会话的增长消息，抬高估算分子制造陈旧差',
    });
    const before = broadcasts.length;
    emitToolsInvalidated({ agentId: agentAId });
    await new Promise((resolve) => setTimeout(resolve, 360));
    const pushed = usagePushesSince(before);
    expect(pushed.length).toBe(1);
    expect(pushed[0]!.sessionId).toBe(sessionId);
  });

  it('session_deleted 清内存表且删除的会话不再推送', () => {
    manager.deleteSession(sessionId);
    const before = broadcasts.length;
    emit('agents_invalidated', null);
    expect(
      usagePushesSince(before).filter((b) => b.sessionId === sessionId).length
    ).toBe(0);
  });
});
