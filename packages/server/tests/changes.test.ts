/**
 * @fileoverview 变更流集成测试：增量拉取、WS 推送、设备持久化。
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

import {
  createAgentRouter,
  type SessionManagersMap,
} from '../src/server/routers/agent.js';
import { createSessionRouter } from '../src/server/routers/session.js';
import { createChangesRouter } from '../src/server/routers/changes.js';
import { createDeviceRouter } from '../src/server/routers/device.js';
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
/** SessionManager 实例映射 */
let sessionManagers: SessionManagersMap;

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

/** 创建测试用 Agent，返回其 chat 会话随建产生的 agentId */
async function createTestAgent(): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'changes-test-agent',
      name: 'Changes Test Agent',
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

describe('Change Stream Integration Tests', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'changes-test-'));
    agentsDir = path.join(tempDir, 'agents');

    sessionManagers = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/agents', createAgentRouter(sessionManagers));
    app.use(
      '/api/agents/:agentId/sessions',
      createSessionRouter(sessionManagers)
    );
    app.use('/api/changes', createChangesRouter());
    app.use('/api/devices', createDeviceRouter());

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
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** 每个测试前清空会话与变更数据 */
  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
    getDb().run('DELETE FROM sessions');
    getDb().run('DELETE FROM changes');
    getDb().run('DELETE FROM devices');
    sessionManagers.clear();
  });

  /** 变更流接口测试 */
  describe('GET /api/changes', () => {
    /** 测试全量拉取按序返回全部事件 */
    it('should return ordered changes after a sequence number', async () => {
      const agentId = await createTestAgent();
      const created = await fetch(
        `${BASE_URL}/api/agents/${agentId}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '变更流会话' }),
        }
      );
      const { session } = (await created.json()) as { session: { id: string } };

      await fetch(`${BASE_URL}/api/agents/${agentId}/sessions/${session.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '改名' }),
      });
      await fetch(`${BASE_URL}/api/agents/${agentId}/sessions/${session.id}`, {
        method: 'DELETE',
      });

      const res = await fetch(`${BASE_URL}/api/changes?since=0`);
      const data = (await res.json()) as {
        changes: SessionChange[];
        head: number;
      };

      expect(data.changes.map((c) => c.kind)).toEqual([
        'agents_invalidated',
        'session_created',
        'session_created',
        'session_updated',
        'session_deleted',
      ]);
      const seqs = data.changes.map((c) => c.seq);
      expect(seqs.every((s, i) => i === 0 || s > seqs[i - 1])).toBe(true);
      expect(data.head).toBe(seqs[seqs.length - 1]);
    });

    /** 测试以 head 为起点拉取返回空且 head 不变 */
    it('should return empty delta when client is at head', async () => {
      await createTestAgent();
      const first = (await (
        await fetch(`${BASE_URL}/api/changes?since=0`)
      ).json()) as { head: number };

      const second = (await (
        await fetch(`${BASE_URL}/api/changes?since=${first.head}`)
      ).json()) as { changes: unknown[]; head: number };

      expect(second.changes).toEqual([]);
      expect(second.head).toBe(first.head);
    });

    /** 测试 limit 截断返回且 head 仍为服务端真实最新序号 */
    it('should paginate with limit and report true head', async () => {
      const agentId = await createTestAgent();
      for (let i = 0; i < 3; i++) {
        await fetch(`${BASE_URL}/api/agents/${agentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `会话 ${i}` }),
        });
      }

      const full = (await (
        await fetch(`${BASE_URL}/api/changes?since=0`)
      ).json()) as { changes: SessionChange[]; head: number };
      expect(full.changes.length).toBeGreaterThan(2);

      const paged = (await (
        await fetch(`${BASE_URL}/api/changes?since=0&limit=2`)
      ).json()) as { changes: SessionChange[]; head: number };
      expect(paged.changes).toHaveLength(2);
      expect(paged.changes.map((c) => c.seq)).toEqual(
        full.changes.slice(0, 2).map((c) => c.seq)
      );
      expect(paged.head).toBe(full.head);
    });

    /** 测试报来的序号超前时 head 回落为服务端真实序号 */
    it('should report server head when client seq is ahead', async () => {
      await createTestAgent();
      const current = (await (
        await fetch(`${BASE_URL}/api/changes?since=0`)
      ).json()) as { head: number };

      const ahead = (await (
        await fetch(`${BASE_URL}/api/changes?since=${current.head + 1000}`)
      ).json()) as { changes: unknown[]; head: number };

      expect(ahead.changes).toEqual([]);
      expect(ahead.head).toBe(current.head);
    });
  });

  /** WS 推送测试 */
  describe('WebSocket change push', () => {
    /** 测试写库提交后客户端实时收到 change 事件 */
    it('should push change events over WebSocket', async () => {
      const client = await connectWs(WS_URL);
      const agentId = await createTestAgent();

      // 建 Agent 先推配置失效，随后初始聊天会话的创建事件
      const invalidation = (await client.waitFor('change')) as {
        change: SessionChange;
      };
      expect(invalidation.change.kind).toBe('agents_invalidated');

      const msg = (await client.waitFor('change')) as {
        change: SessionChange;
      };
      expect(msg.change.kind).toBe('session_created');
      expect(msg.change.sessionId).toBe(`chat-${agentId}`);
      expect(typeof msg.change.seq).toBe('number');

      await client.close();
    });
  });

  /** 设备持久化测试 */
  describe('GET /api/devices', () => {
    /** 测试设备注册落库并在列表中带在线标志 */
    it('should persist device and list with online flag', async () => {
      const before = (await (
        await fetch(`${BASE_URL}/api/devices`)
      ).json()) as { devices: unknown[] };
      expect(before.devices).toEqual([]);

      const observer = await connectWs(WS_URL);
      const registrar = await connectWs(WS_URL);
      registrar.ws.send(
        JSON.stringify({
          type: 'register',
          deviceId: 'dev-list',
          deviceType: 'desktop',
          deviceName: 'List Mac',
        })
      );
      await observer.waitFor('device_online');

      const during = (await (
        await fetch(`${BASE_URL}/api/devices`)
      ).json()) as {
        devices: Array<{
          deviceId: string;
          online: boolean;
          lastOnline: number | null;
        }>;
      };
      expect(during.devices).toHaveLength(1);
      expect(during.devices[0]).toMatchObject({
        deviceId: 'dev-list',
        online: true,
      });

      await registrar.close();
      await observer.waitFor('device_offline');

      const after = (await (await fetch(`${BASE_URL}/api/devices`)).json()) as {
        devices: Array<{
          deviceId: string;
          online: boolean;
          lastOnline: number;
        }>;
      };
      expect(after.devices[0]).toMatchObject({
        deviceId: 'dev-list',
        online: false,
      });
      expect(after.devices[0].lastOnline).toBeGreaterThan(0);

      await observer.close();
    });
  });
});
