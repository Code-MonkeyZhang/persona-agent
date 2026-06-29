/**
 * @fileoverview Session 模块集成测试
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
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import { SessionStore } from '../src/session/store.js';
import { SessionManager } from '../src/session/session-manager.js';
import type { Session, SessionMeta } from '../src/session/types.js';
import type { Message } from '../src/schema/index.js';
import type { SessionManagersMap } from '../src/server/routers/agent.js';
import type { AgentConfigInput } from '../src/agent/index.js';

/** 临时测试目录 */
let tempDir: string;
/** Agent 配置目录 */
let agentsDir: string;
/** 当前测试用的 agentId */
let currentAgentId: string;

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => agentsDir,
  getAgentDir: (id: string) => `${agentsDir}/${id}`,
  getAgentConfigPath: (id: string) => `${agentsDir}/${id}/config.json`,
  getAgentSystemPromptPath: (id: string) => `${agentsDir}/${id}/systemPrompt.md`,
  getAgentSessionsDir: (id: string) => `${agentsDir}/${id}/sessions`,
  getAgentAssetsDir: (id: string) => `${agentsDir}/${id}/assets`,
  getAgentAssetsBodyDir: (id: string) => `${agentsDir}/${id}/assets/body`,
  getAgentAssetsBackgroundsDir: (id: string) => `${agentsDir}/${id}/assets/backgrounds`,
  getAgentMemoryDir: (id: string) => `${agentsDir}/${id}/memory`,
}));

import { createSessionRouter } from '../src/server/routers/session.js';
import { createAgentRouter } from '../src/server/routers/agent.js';
import {
  createAgentConfig,
} from '../src/agent/index.js';
import { getAgentDir } from '../src/util/paths.js';

/**
 * 查找可用端口用于测试服务器
 * @returns 可用的端口号
 */
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

/** 默认模型配置 */
const defaultModel = { provider: 'openai', model: 'gpt-4' };

/**
 * 创建测试用 Agent 配置输入
 * @param overrides - 覆盖默认配置的字段
 * @returns Agent 配置输入对象
 */
function createTestAgentInput(
  overrides: Partial<AgentConfigInput> = {}
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

/**
 * 创建测试用 SessionMeta fixture
 * @param id - session ID
 * @returns SessionMeta 对象
 */
function createMeta(id: string): SessionMeta {
  return {
    id,
    agentId: currentAgentId,
    title: `Session ${id}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: defaultModel,
  };
}

/** 测试用消息 */
function createUserMessage(content: string): Message {
  return { role: 'user', content };
}

describe('Session Module Integration Tests', () => {
  /** 初始化测试服务器和临时目录 */
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
    agentsDir = path.join(tempDir, 'agents');

    sessionManagers = new Map();
    app = express();
    app.use(express.json());
    app.use('/api/agents', createAgentRouter(sessionManagers));
    app.use(
      '/api/agents/:agentId/sessions',
      createSessionRouter(sessionManagers)
    );

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  /** 清理测试服务器和临时目录 */
  afterAll(async () => {
    httpServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** SessionStore 测试 */
  describe('SessionStore', () => {
    let store: SessionStore;

    /** 每个测试前初始化 Store */
    beforeEach(() => {
      currentAgentId = 'store-test-agent-1';
      const agentDir = path.join(agentsDir, currentAgentId);
      fs.mkdirSync(agentDir, { recursive: true });
      const sessionsDir = path.join(agentDir, 'sessions');
      if (fs.existsSync(sessionsDir)) {
        fs.rmSync(sessionsDir, { recursive: true, force: true });
      }
      store = new SessionStore(currentAgentId);
    });

    /** createSessionFile / loadSession 测试 */
    describe('createSessionFile / loadSession', () => {
      /** 测试加载不存在的 session 返回 null */
      it('should return null for non-existent session', () => {
        const session = store.loadSession('non-existent');
        expect(session).toBeNull();
      });

      /** 测试创建并加载 session */
      it('should create and load session', () => {
        const meta = createMeta('session-1');
        store.createSessionFile(meta);
        const loaded = store.loadSession('session-1');

        expect(loaded).not.toBeNull();
        expect(loaded?.id).toBe('session-1');
        expect(loaded?.title).toBe('Session session-1');
        expect(loaded?.messages).toEqual([]);
      });

      /** 测试 session 持久化到 .jsonl 文件 */
      it('should persist session to .jsonl file', () => {
        const meta = createMeta('persist-test');
        store.createSessionFile(meta);

        const sessionPath = path.join(
          store.getSessionsPath(),
          'persist-test.jsonl'
        );
        expect(fs.existsSync(sessionPath)).toBe(true);
      });
    });

    /** appendMessageLine 测试 */
    describe('appendMessageLine', () => {
      /** 测试追加消息后能通过 loadSession 读到 */
      it('should append message and be readable via loadSession', () => {
        const meta = createMeta('append-test');
        store.createSessionFile(meta);

        const result = store.appendMessageLine(
          'append-test',
          createUserMessage('Hello!')
        );
        expect(result).toBe(true);

        const loaded = store.loadSession('append-test');
        expect(loaded?.messages.length).toBe(1);
        expect(loaded?.messages[0]?.role).toBe('user');
        expect(loaded?.messages[0]?.content).toBe('Hello!');
      });

      /** 测试向不存在的 session 追加消息返回 false */
      it('should return false for non-existent session', () => {
        const result = store.appendMessageLine(
          'non-existent',
          createUserMessage('test')
        );
        expect(result).toBe(false);
      });
    });

    /** rewriteMetaLine 测试 */
    describe('rewriteMetaLine', () => {
      /** 测试重写元数据后消息不丢失 */
      it('should rewrite meta without losing messages', () => {
        const meta = createMeta('rewrite-test');
        store.createSessionFile(meta);
        store.appendMessageLine(
          'rewrite-test',
          createUserMessage('msg1')
        );
        store.appendMessageLine(
          'rewrite-test',
          createUserMessage('msg2')
        );

        store.rewriteMetaLine('rewrite-test', {
          ...meta,
          title: 'Updated Title',
        });

        const loaded = store.loadSession('rewrite-test');
        expect(loaded?.title).toBe('Updated Title');
        expect(loaded?.messages.length).toBe(2);
      });
    });

    /** listSessionFiles 测试 */
    describe('listSessionFiles', () => {
      /** 测试列出所有 session 元数据 */
      it('should list all session metas', () => {
        store.createSessionFile(createMeta('list-1'));
        store.createSessionFile(createMeta('list-2'));

        const list = store.listSessionFiles();
        expect(list.length).toBe(2);
        expect(list.map((m) => m.id).sort()).toEqual(['list-1', 'list-2']);
      });

      /** 测试目录不存在时返回空数组 */
      it('should return empty array when no sessions exist', () => {
        const emptyStore = new SessionStore('no-sessions-agent');
        expect(emptyStore.listSessionFiles()).toEqual([]);
      });
    });

    /** deleteSessionFile 测试 */
    describe('deleteSessionFile', () => {
      /** 测试删除 session 文件 */
      it('should delete session file', () => {
        store.createSessionFile(createMeta('delete-test'));
        expect(store.loadSession('delete-test')).not.toBeNull();

        const deleted = store.deleteSessionFile('delete-test');
        expect(deleted).toBe(true);
        expect(store.loadSession('delete-test')).toBeNull();
      });

      /** 测试删除不存在的 session 返回 false */
      it('should return false for non-existent session', () => {
        const deleted = store.deleteSessionFile('non-existent');
        expect(deleted).toBe(false);
      });
    });
  });

  /** SessionManager 测试 */
  describe('SessionManager', () => {
    let manager: SessionManager;
    let agentId: string;

    /** 每个测试前初始化 Manager */
    beforeEach(() => {
      if (fs.existsSync(agentsDir)) {
        fs.rmSync(agentsDir, { recursive: true, force: true });
      }

      const agent = createAgentConfig(createTestAgentInput({ id: 'session-agent' }));
      agentId = agent.id;

      const agentBasePath = getAgentDir(agentId);
      const store = new SessionStore(agentId);
      manager = new SessionManager(
        store,
        agentId
      );
    });

    /** createSession 测试 */
    describe('createSession', () => {
      /** 测试自动生成 ID 创建 session */
      it('should create session with auto-generated ID', () => {
        const session = manager.createSession();

        expect(session.id).toBeDefined();
        expect(session.agentId).toBe(agentId);
        expect(session.title).toBe('New Session');
        expect(session.messages).toEqual([]);
        expect(session.model).toEqual(defaultModel);
      });

      /** 测试生成的 ID 符合 timestamp-shortUUID 格式 */
      it('should generate ID in YYYYMMDD-HHmmss-xxxxxxxx format', () => {
        const session = manager.createSession();

        expect(session.id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{8}$/);
      });

      /** 测试使用自定义选项创建 session */
      it('should create session with custom options', () => {
        const session = manager.createSession({
          title: 'Custom Title',
        });

        expect(session.title).toBe('Custom Title');
        expect(session.model).toEqual(defaultModel);
      });

      /** 测试创建的 session 出现在列表中 */
      it('should list created session', () => {
        manager.createSession({ title: 'Listed Session' });
        const sessions = manager.listSessions();

        expect(sessions.length).toBe(1);
        expect(sessions[0]?.title).toBe('Listed Session');
      });
    });

    /** getSession 测试 */
    describe('getSession', () => {
      /** 测试通过 ID 获取 session */
      it('should return session by ID', () => {
        const created = manager.createSession({ title: 'Get Test' });
        const session = manager.getSession(created.id);

        expect(session).not.toBeNull();
        expect(session?.title).toBe('Get Test');
      });

      /** 测试获取不存在的 session 返回 null */
      it('should return null for non-existent session', () => {
        const session = manager.getSession('non-existent');
        expect(session).toBeNull();
      });
    });

    /** listSessions 测试 */
    describe('listSessions', () => {
      /** 测试按 updatedAt 降序返回 sessions */
      it('should return sessions sorted by updatedAt desc', async () => {
        manager.createSession({ title: 'First' });
        await new Promise((r) => setTimeout(r, 10));
        manager.createSession({ title: 'Second' });
        await new Promise((r) => setTimeout(r, 10));
        manager.createSession({ title: 'Third' });

        const sessions = manager.listSessions();
        expect(sessions.length).toBe(3);
        expect(sessions[0]?.title).toBe('Third');
        expect(sessions[2]?.title).toBe('First');
      });
    });

    /** deleteSession 测试 */
    describe('deleteSession', () => {
      /** 测试删除 session */
      it('should delete session', () => {
        const session = manager.createSession({ title: 'To Delete' });
        const deleted = manager.deleteSession(session.id);

        expect(deleted).toBe(true);
        expect(manager.getSession(session.id)).toBeNull();
      });

      /** 测试删除后不在列表中 */
      it('should remove session from listing', () => {
        const session = manager.createSession({ title: 'Remove Me' });
        manager.deleteSession(session.id);

        const sessions = manager.listSessions();
        expect(sessions.find((s) => s.id === session.id)).toBeUndefined();
      });

      /** 测试删除不存在的 session 返回 false */
      it('should return false for non-existent session', () => {
        const deleted = manager.deleteSession('non-existent');
        expect(deleted).toBe(false);
      });
    });

    /** appendMessage 测试 */
    describe('appendMessage', () => {
      /** 测试追加用户消息 */
      it('should append user message', () => {
        const session = manager.createSession();
        const result = manager.appendMessage(session.id, {
          role: 'user',
          content: 'Hello!',
        });

        expect(result).toBe(true);
        const loaded = manager.getSession(session.id);
        expect(loaded?.messages.length).toBe(1);
        expect(loaded?.messages[0]?.content).toBe('Hello!');
      });

      /** 测试向不存在的 session 追加消息返回 false */
      it('should return false for non-existent session', () => {
        const result = manager.appendMessage('non-existent', {
          role: 'user',
          content: 'test',
        });
        expect(result).toBe(false);
      });
    });

    /** updateTitle 测试 */
    describe('updateTitle', () => {
      /** 测试更新 session 标题 */
      it('should update session title', () => {
        const session = manager.createSession({ title: 'Old Title' });
        const updated = manager.updateTitle(session.id, 'New Title');

        expect(updated?.title).toBe('New Title');
      });
    });

    /** updateWorkspacePath 测试 */
    describe('updateWorkspacePath', () => {
      /** 测试更新工作区路径 */
      it('should update workspace path', () => {
        const session = manager.createSession();
        const updated = manager.updateWorkspacePath(session.id, '/new/path');

        expect(updated?.workspacePath).toBe('/new/path');
      });
    });

    /** updateModel 测试 */
    describe('updateModel', () => {
      /** 测试更新模型配置 */
      it('should update model config', () => {
        const session = manager.createSession();
        const newModel = { provider: 'anthropic', model: 'claude-3' };
        const updated = manager.updateModel(session.id, newModel);

        expect(updated?.model).toEqual(newModel);
      });
    });
  });

  /** HTTP API - Session 路由测试 */
  describe('HTTP API - Session Routes', () => {
    /** 每个测试前清理数据 */
    beforeEach(() => {
      if (fs.existsSync(agentsDir)) {
        fs.rmSync(agentsDir, { recursive: true, force: true });
      }
      sessionManagers.clear();
    });

    /**
     * 创建测试用 Agent
     * @returns Agent ID
     */
    async function createTestAgent(): Promise<string> {
      const response = await fetch(`${BASE_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createTestAgentInput({ id: 'http-test-agent' })),
      });
      const { agent } = (await response.json()) as { agent: { id: string } };
      return agent.id;
    }

    /** GET /api/agents/:agentId/sessions 测试 */
    describe('GET /api/agents/:agentId/sessions', () => {
      /** 测试新建 Agent 自动创建聊天 Session */
      it('should return chat session when no manual sessions exist', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as { sessions: SessionMeta[] };
        expect(data.sessions).toHaveLength(1);
        expect(data.sessions[0].id).toBe(SessionManager.chatSessionIdFor(agentId));
        expect(data.sessions[0].title).toBe('聊天');
      });

      /** 测试返回 agent 的所有 sessions */
      it('should return all sessions for agent', async () => {
        const agentId = await createTestAgent();

        await fetch(`${BASE_URL}/api/agents/${agentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Session A' }),
        });
        await fetch(`${BASE_URL}/api/agents/${agentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Session B' }),
        });

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`
        );
        const data = (await response.json()) as { sessions: SessionMeta[] };
        // 聊天 Session + 2 个手动创建 = 3
        expect(data.sessions.length).toBe(3);
      });

      /** 测试不存在的 agent 返回 404 */
      it('should return 404 for non-existent agent', async () => {
        const response = await fetch(
          `${BASE_URL}/api/agents/non-existent/sessions`
        );
        expect(response.status).toBe(404);
      });
    });

    /** POST /api/agents/:agentId/sessions 测试 */
    describe('POST /api/agents/:agentId/sessions', () => {
      /** 测试创建新 session */
      it('should create a new session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(`${BASE_URL}/api/agents/${agentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Session' }),
        });

        expect(response.status).toBe(201);
        const data = (await response.json()) as { session: Session };
        expect(data.session.title).toBe('New Session');
        expect(data.session.agentId).toBe(agentId);
      });
    });

    /** GET /api/agents/:agentId/sessions/:id 测试 */
    describe('GET /api/agents/:agentId/sessions/:id', () => {
      /** 测试通过 ID 获取 session */
      it('should return session by ID', async () => {
        const agentId = await createTestAgent();

        const createResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Get Test' }),
          }
        );
        const { session: created } = (await createResponse.json()) as {
          session: Session;
        };

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as { session: Session };
        expect(data.session.title).toBe('Get Test');
      });

      /** 测试不存在的 session 返回 404 */
      it('should return 404 for non-existent session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/non-existent`
        );
        expect(response.status).toBe(404);
      });
    });

    /** PUT /api/agents/:agentId/sessions/:id 测试 */
    describe('PUT /api/agents/:agentId/sessions/:id', () => {
      /** 测试更新 session 标题 */
      it('should update session title', async () => {
        const agentId = await createTestAgent();

        const createResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Old Title' }),
          }
        );
        const { session: created } = (await createResponse.json()) as {
          session: Session;
        };

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Title' }),
          }
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as { session: Session };
        expect(data.session.title).toBe('New Title');
      });

      /** 测试更新多个字段 */
      it('should update multiple fields', async () => {
        const agentId = await createTestAgent();

        const createResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );
        const { session: created } = (await createResponse.json()) as {
          session: Session;
        };

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: 'Updated Title',
              workspacePath: '/new/path',
            }),
          }
        );

        const data = (await response.json()) as { session: Session };
        expect(data.session.title).toBe('Updated Title');
        expect(data.session.workspacePath).toBe('/new/path');
      });

      /** 测试无字段时返回 400 */
      it('should return 400 when no fields provided', async () => {
        const agentId = await createTestAgent();

        const createResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );
        const { session: created } = (await createResponse.json()) as {
          session: Session;
        };

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        );

        expect(response.status).toBe(400);
      });

      /** 测试不存在的 session 返回 404 */
      it('should return 404 for non-existent session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/non-existent`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Title' }),
          }
        );

        expect(response.status).toBe(404);
      });
    });

    /** DELETE /api/agents/:agentId/sessions/:id 测试 */
    describe('DELETE /api/agents/:agentId/sessions/:id', () => {
      /** 测试删除 session */
      it('should delete session', async () => {
        const agentId = await createTestAgent();

        const createResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'To Delete' }),
          }
        );
        const { session: created } = (await createResponse.json()) as {
          session: Session;
        };

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as { success: boolean };
        expect(data.success).toBe(true);

        const getResponse = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${created.id}`
        );
        expect(getResponse.status).toBe(404);
      });

      /** 测试不存在的 session 返回 404 */
      it('should return 404 for non-existent session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/non-existent`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(404);
      });

      /** 聊天 Session 不允许删除 */
      it('should return 403 when deleting chat session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${SessionManager.chatSessionIdFor(agentId)}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(403);
      });
    });

    /** 聊天 Session 保护测试 */
    describe('Chat session protection', () => {
      /** 聊天 Session 不允许改标题 */
      it('should return 403 when renaming chat session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${SessionManager.chatSessionIdFor(agentId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Hacked' }),
          }
        );

        expect(response.status).toBe(403);
      });

      /** 聊天 Session 允许改 model */
      it('should allow updating chat session model', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${SessionManager.chatSessionIdFor(agentId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: { provider: 'openai', model: 'gpt-4o' },
            }),
          }
        );

        expect(response.status).toBe(200);
      });
    });
  });
});
