/**
 * @fileoverview 全量同步快照测试：形状、行号递增、与变更流的衔接。
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
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionChange } from '@persona/shared';

/** 临时测试目录 */
let tempDir: string;
/** Agent 配置存储目录 */
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
  getDbPath: () => path.join(tempDir, 'persona.db'),
}));

import {
  createAgentRouter,
  type SessionManagersMap,
} from '../src/server/routers/agent.js';
import { createSessionRouter } from '../src/server/routers/session.js';
import { createSyncRouter } from '../src/server/routers/sync.js';
import { createChangesRouter } from '../src/server/routers/changes.js';
import { getDb, closeDb } from '../src/db/index.js';

/** 查找可用端口，避免端口冲突 */
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** Express 应用实例 */
let app: Express;
/** HTTP 服务器实例 */
let httpServer: Server;
/** 测试服务器端口 */
let PORT: number;
/** API 基础 URL */
let BASE_URL: string;
/** SessionManager 实例映射 */
let sessionManagers: SessionManagersMap;

/** 创建测试用 Agent，返回 agentId */
async function createTestAgent(name: string): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: `sync-${name}`,
      name: 'Sync Test Agent',
      systemPrompt: 'You are a helpful assistant.',
      defaultModel: { provider: 'openai', model: 'gpt-4' },
      maxSteps: 10,
      mcpNames: [],
      skillNames: [],
    }),
  });
  const { agent } = (await response.json()) as { agent: { id: string } };
  return agent.id;
}

/** 快照响应形状 */
interface SnapshotResponse {
  snapshot: {
    latestSeq: number;
    sessions: Array<{
      id: string;
      agentId: string;
      turnEnds?: number[];
      messages: Array<{ seq: number; message: Record<string, unknown> }>;
    }>;
  };
}

describe('Sync Snapshot Tests', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-test-'));
    agentsDir = path.join(tempDir, 'agents');

    sessionManagers = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/agents', createAgentRouter(sessionManagers));
    app.use(
      '/api/agents/:agentId/sessions',
      createSessionRouter(sessionManagers)
    );
    app.use('/api/sync', createSyncRouter());
    app.use('/api/changes', createChangesRouter());

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  afterAll(async () => {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** 每个测试前清空会话与变更数据 */
  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
    getDb().run('DELETE FROM sessions');
    getDb().run('DELETE FROM changes');
    sessionManagers.clear();
  });

  /** 测试快照包含全部角色的会话，消息行号挂到消息上且按序递增 */
  it('should include all agents with seq attached in order', async () => {
    const agentA = await createTestAgent('a');
    const agentB = await createTestAgent('b');

    // 各发两条消息，manager 直写走库路径
    const managerA = sessionManagers.get(agentA);
    const managerB = sessionManagers.get(agentB);
    if (!managerA || !managerB) throw new Error('managers missing');
    const chatA = managerA.listSessions()[0];
    const chatB = managerB.listSessions()[0];
    managerA.appendMessage(chatA.id, { role: 'user', content: 'hello A' });
    managerA.appendMessage(chatA.id, {
      role: 'assistant',
      content: 'reply A',
    });
    managerB.appendMessage(chatB.id, { role: 'user', content: 'hello B' });

    const res = await fetch(`${BASE_URL}/api/sync/snapshot`);
    expect(res.status).toBe(200);
    const { snapshot } = (await res.json()) as SnapshotResponse;

    expect(snapshot.sessions).toHaveLength(2);
    for (const session of snapshot.sessions) {
      expect(session.messages.length).toBeGreaterThan(0);
      const seqs = session.messages.map((m) => m.seq);
      expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1])).toBe(true);
      for (const m of session.messages) {
        expect(m.message.seq).toBe(m.seq);
      }
    }

    // latestSeq 与 changes 表一致
    const headRow = getDb()
      .query<{ max: number | null }>('SELECT MAX(seq) AS max FROM changes')
      .get();
    expect(snapshot.latestSeq).toBe(headRow?.max ?? 0);
  });

  /** 测试空库快照 latestSeq 为零 */
  it('should return zero latestSeq on empty database', async () => {
    const res = await fetch(`${BASE_URL}/api/sync/snapshot`);
    const { snapshot } = (await res.json()) as SnapshotResponse;
    expect(snapshot.latestSeq).toBe(0);
    expect(snapshot.sessions).toEqual([]);
  });

  /** 测试快照之后的新变化序号必然大于 latestSeq，客户端可无缝追平 */
  it('should have subsequent changes beyond snapshot latestSeq', async () => {
    const agentId = await createTestAgent('after');
    const manager = sessionManagers.get(agentId);
    if (!manager) throw new Error('manager missing');
    const chat = manager.listSessions()[0];
    manager.appendMessage(chat.id, { role: 'user', content: 'before' });

    const first = (await (await fetch(`${BASE_URL}/api/sync/snapshot`)).json())
      .snapshot as SnapshotResponse['snapshot'];

    manager.appendMessage(chat.id, { role: 'user', content: 'after' });

    const delta = (await (
      await fetch(`${BASE_URL}/api/changes?since=${first.latestSeq}`)
    ).json()) as { changes: SessionChange[]; head: number };
    expect(delta.changes.length).toBeGreaterThan(0);
    for (const change of delta.changes) {
      expect(change.seq).toBeGreaterThan(first.latestSeq);
    }
    expect(delta.head).toBeGreaterThan(first.latestSeq);
  });
});
