/**
 * @fileoverview Agent 变更流测试：增删改各自登记 agents_invalidated 事件。
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
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { WebSocket } from 'ws';
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

import { createAgentRouter } from '../src/server/routers/agent.js';
import { createChangesRouter } from '../src/server/routers/changes.js';
import {
  initWebSocket,
  shutdownWebSocket,
} from '../src/server/websocket-server.js';
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
/** WebSocket 连接 URL */
let WS_URL: string;

/**
 * 测试用 WS 客户端，缓冲消息并按类型等待。
 * 处理器在构造时挂载，确保不丢服务器首条消息。
 */
class WsClient {
  readonly ws: WebSocket;
  private buffer: Array<Record<string, unknown>> = [];
  private waiters: Array<{
    type: string;
    resolve: (msg: Record<string, unknown>) => void;
  }> = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      const msg = JSON.parse(String(data)) as Record<string, unknown>;
      const idx = this.waiters.findIndex((w) => w.type === msg.type);
      if (idx >= 0) {
        this.waiters.splice(idx, 1)[0].resolve(msg);
      } else {
        this.buffer.push(msg);
      }
    });
  }

  /** 等待指定类型的消息，优先从缓冲区取 */
  waitFor(type: string, timeout = 3000): Promise<Record<string, unknown>> {
    const idx = this.buffer.findIndex((m) => m.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.buffer.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout waiting for "${type}"`)),
        timeout
      );
      this.waiters.push({
        type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.on('close', () => resolve());
      this.ws.close();
    });
  }
}

/** 连接 WS 并等待服务器 connected 确认 */
function connectWs(url: string): Promise<WsClient> {
  return new Promise((resolve, reject) => {
    const client = new WsClient(url);
    client.ws.on('error', reject);
    client
      .waitFor('connected')
      .then(() => resolve(client))
      .catch(reject);
  });
}

/** 创建测试用 Agent，返回服务端生成的 agentId */
async function createTestAgent(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Agent Changes Test',
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

describe('Agent Change Stream Tests', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-changes-test-'));
    agentsDir = path.join(tempDir, 'agents');

    app = express();
    app.use(express.json());
    app.use('/api/agents', createAgentRouter());
    app.use('/api/changes', createChangesRouter());

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;
    WS_URL = `ws://localhost:${PORT}/ws`;

    httpServer = createServer(app);
    initWebSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  afterAll(async () => {
    shutdownWebSocket();
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    closeDb();
    rmTempDir(tempDir);
  });

  /** 每个测试前清空 Agent 目录与变更流 */
  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
    getDb().run('DELETE FROM changes');
  });

  /** 创建 Agent 后 WS 推来 agents_invalidated，事件体不带载荷 */
  it('should push agents_invalidated on create', async () => {
    const client = await connectWs(WS_URL);
    await createTestAgent();

    const msg = (await client.waitFor('change')) as { change: SessionChange };
    expect(msg.change.kind).toBe('agents_invalidated');
    expect(msg.change.sessionId).toBeNull();
    expect(msg.change.data).toEqual({});
    expect(msg.change.seq).toBeGreaterThan(0);
    await client.close();

    const list = (await (
      await fetch(`${BASE_URL}/api/changes?since=0`)
    ).json()) as { changes: SessionChange[]; head: number };
    expect(list.changes).toHaveLength(1);
    expect(list.changes[0].kind).toBe('agents_invalidated');
    expect(list.head).toBe(msg.change.seq);
  });

  /** 更新与删除各自登记新事件，seq 全程单调递增 */
  it('should record increasing seq across update and delete', async () => {
    const agentId = await createTestAgent();
    const first = (
      (await (
        await fetch(`${BASE_URL}/api/changes?since=0`)
      ).json()) as { changes: SessionChange[] }
    ).changes[0];

    const put = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed Agent' }),
    });
    expect(put.status).toBe(200);

    const del = await fetch(`${BASE_URL}/api/agents/${agentId}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);

    const { changes } = (await (
      await fetch(`${BASE_URL}/api/changes?since=0`)
    ).json()) as { changes: SessionChange[] };
    expect(changes.map((c) => c.kind)).toEqual([
      'agents_invalidated',
      'agents_invalidated',
      'agents_invalidated',
    ]);
    const seqs = changes.map((c) => c.seq);
    expect(seqs[0]).toBe(first.seq);
    expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1])).toBe(true);

    const list = (await (await fetch(`${BASE_URL}/api/agents`)).json()) as {
      agents: Array<{ id: string }>;
    };
    expect(list.agents.map((a) => a.id)).not.toContain(agentId);
  });
});
