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

import { createSessionRouter } from '../src/server/routers/session.js';
import { createAgentRouter } from '../src/server/routers/agent.js';
import { createAgentConfig } from '../src/agent/index.js';
import { getAgentDir } from '../src/util/paths.js';
import { getDb, closeDb } from '../src/db/index.js';

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
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /** SessionStore 测试 */
  describe('SessionStore', () => {
    let store: SessionStore;

    /** 每个测试前初始化 Store，清掉该 agent 的历史会话行 */
    beforeEach(() => {
      currentAgentId = 'store-test-agent-1';
      const agentDir = path.join(agentsDir, currentAgentId);
      fs.mkdirSync(agentDir, { recursive: true });
      // 消息行经外键级联一并清除，变更行无外键需单独清
      getDb().run('DELETE FROM sessions WHERE agent_id = ?', currentAgentId);
      getDb().run('DELETE FROM changes');
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

      /** 测试会话落库后新 Store 实例可读回 */
      it('should persist session across store instances', () => {
        store.createSessionFile(createMeta('persist-test'));

        const reopened = new SessionStore(currentAgentId);
        expect(reopened.loadSession('persist-test')).not.toBeNull();
      });
    });

    /** loadSession 派生信封时间戳测试 */
    describe('loadSession envelope timestamps', () => {
      /**
       * 直接往 messages 表插入自定义 created_at 的消息行，
       * 绕开 appendMessageLine 的实时时间。
       */
      const appendTimedLine = (
        id: string,
        createdAt: number,
        msg: Message
      ): void => {
        getDb().run(
          'INSERT INTO messages (session_id, role, created_at, data) VALUES (?, ?, ?, ?)',
          id,
          msg.role,
          createdAt,
          JSON.stringify(msg)
        );
      };

      /** 测试从消息行时间戳列派生 lastContextAt / lastMessageAt */
      it('should derive lastContextAt / lastMessageAt from envelope timestamps', () => {
        store.createSessionFile(createMeta('env-ts-session'));
        appendTimedLine(
          'env-ts-session',
          Date.parse('2026-08-16T00:00:00.000Z'),
          createUserMessage('old')
        );
        appendTimedLine(
          'env-ts-session',
          Date.parse('2026-08-17T00:00:00.000Z'),
          {
            role: 'context',
            source: 'runtime-context',
            content: '[system] 当前时间：2026-08-17 星期一 09:00 (UTC+8)',
          }
        );
        appendTimedLine(
          'env-ts-session',
          Date.parse('2026-08-18T00:00:00.000Z'),
          createUserMessage('new')
        );

        const loaded = store.loadSession('env-ts-session');
        expect(loaded?.lastContextAt).toBe(
          Date.parse('2026-08-17T00:00:00.000Z')
        );
        expect(loaded?.lastMessageAt).toBe(
          Date.parse('2026-08-18T00:00:00.000Z')
        );
      });

      /** 测试无 context 消息时 lastContextAt 为 undefined */
      it('should leave lastContextAt undefined for legacy files', () => {
        store.createSessionFile(createMeta('legacy-ts-session'));
        appendTimedLine(
          'legacy-ts-session',
          Date.parse('2026-08-16T00:00:00.000Z'),
          createUserMessage('old')
        );

        const loaded = store.loadSession('legacy-ts-session');
        expect(loaded?.lastContextAt).toBeUndefined();
        expect(loaded?.lastMessageAt).toBe(
          Date.parse('2026-08-16T00:00:00.000Z')
        );
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

    /** appendTurnEndLine 测试 */
    describe('appendTurnEndLine', () => {
      /** 测试追加标记行后 loadSession 收集 turnEnds 下标 */
      it('should append marker and collect turnEnds via loadSession', () => {
        store.createSessionFile(createMeta('turn-end-test'));
        store.appendMessageLine('turn-end-test', createUserMessage('q1'));
        store.appendMessageLine('turn-end-test', {
          role: 'assistant',
          content: 'a1',
        });
        expect(store.appendTurnEndLine('turn-end-test')).toBe(true);
        store.appendMessageLine(
          'turn-end-test',
          createUserMessage('interject')
        );
        store.appendMessageLine('turn-end-test', {
          role: 'assistant',
          content: 'a2',
        });
        store.appendTurnEndLine('turn-end-test');

        const loaded = store.loadSession('turn-end-test');
        // 标记行不进 messages，turnEnds 记录各标记之前的消息数
        expect(loaded?.messages.length).toBe(4);
        expect(loaded?.turnEnds).toEqual([2, 4]);
      });

      /** 测试空会话连续 turn_end 记录重复下标，空缓冲轮次语义由列值承载 */
      it('should record duplicate counts for consecutive empty turn ends', () => {
        store.createSessionFile(createMeta('marker-shape'));
        store.appendTurnEndLine('marker-shape');
        store.appendTurnEndLine('marker-shape');

        const loaded = store.loadSession('marker-shape');
        expect(loaded?.turnEnds).toEqual([0, 0]);
      });

      /** 测试无标记时 turnEnds 为 undefined */
      it('should leave turnEnds undefined for legacy files', () => {
        store.createSessionFile(createMeta('legacy-turn-end'));
        store.appendMessageLine('legacy-turn-end', createUserMessage('old'));

        const loaded = store.loadSession('legacy-turn-end');
        expect(loaded?.turnEnds).toBeUndefined();
      });

      /** 测试向不存在的 session 追加标记返回 false */
      it('should return false for non-existent session', () => {
        expect(store.appendTurnEndLine('non-existent')).toBe(false);
      });
    });

    /** rewriteMetaLine 测试 */
    describe('rewriteMetaLine', () => {
      /** 测试重写元数据后消息不丢失 */
      it('should rewrite meta without losing messages', () => {
        const meta = createMeta('rewrite-test');
        store.createSessionFile(meta);
        store.appendMessageLine('rewrite-test', createUserMessage('msg1'));
        store.appendMessageLine('rewrite-test', createUserMessage('msg2'));

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

      /** lastMessage 预览派生测试 */
      describe('lastMessage preview', () => {
        /** 建会话后逐条经 appendMessageLine 追加消息 */
        const writeSessionLines = (id: string, msgs: Message[]): void => {
          store.createSessionFile(createMeta(id));
          for (const msg of msgs) {
            store.appendMessageLine(id, msg);
          }
        };

        /** 从列表结果中取指定 id 的 lastMessage */
        const previewOf = (id: string): string | undefined =>
          store.listSessionFiles().find((m) => m.id === id)?.lastMessage;

        /** 测试聊天会话末行 user 文本被清洗截断为预览 */
        it('should clean and truncate last user text for chat session', () => {
          writeSessionLines('chat-preview-text', [
            createUserMessage('<b>hello</b> world'),
            createUserMessage('x'.repeat(120)),
          ]);
          expect(previewOf('chat-preview-text')).toBe('x'.repeat(80));
        });

        /** 测试 HTML 标签被剥离后进入预览 */
        it('should strip html tags from preview', () => {
          writeSessionLines('chat-preview-html', [
            createUserMessage('<p>hello <b>world</b></p>'),
          ]);
          expect(previewOf('chat-preview-html')).toBe('hello world');
        });

        /** 测试末行 context 注入不泄漏，回退到前一条真实消息 */
        it('should skip trailing context injection and fall back', () => {
          writeSessionLines('chat-preview-ctx', [
            createUserMessage('real message'),
            {
              role: 'context',
              source: 'runtime-context',
              content: '[system] 当前时间：2026-08-18 星期二 09:00 (UTC+8)',
            },
          ]);
          expect(previewOf('chat-preview-ctx')).toBe('real message');
        });

        /** 测试末行 assistant 纯工具步无 content 时继续往前找 */
        it('should keep looking back past contentless assistant steps', () => {
          writeSessionLines('chat-preview-tool', [
            createUserMessage('before tools'),
            { role: 'assistant', tool_calls: [] },
          ]);
          expect(previewOf('chat-preview-tool')).toBe('before tools');
        });

        /** 测试空会话无消息时 lastMessage 为 undefined */
        it('should leave lastMessage undefined for empty chat session', () => {
          writeSessionLines('chat-preview-empty', []);
          expect(previewOf('chat-preview-empty')).toBeUndefined();
        });

        /** 测试 user 消息为 ContentBlock 数组时拼接文本块 */
        it('should join text blocks for array user content', () => {
          writeSessionLines('chat-preview-blocks', [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'part one ' },
                { type: 'text', text: 'part two' },
              ],
            },
          ]);
          expect(previewOf('chat-preview-blocks')).toBe('part one part two');
        });

        /** 测试普通任务会话即使有消息也不计算预览 */
        it('should not compute preview for non-chat sessions', () => {
          writeSessionLines('task-preview-none', [
            createUserMessage('should not appear'),
          ]);
          expect(previewOf('task-preview-none')).toBeUndefined();
        });
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

    /** 库级存储行为测试 */
    describe('SQLite-backed behavior', () => {
      /** 测试跨会话的 seq 全局单调递增 */
      it('should allocate strictly increasing seq across sessions', () => {
        store.createSessionFile(createMeta('seq-a'));
        store.createSessionFile(createMeta('seq-b'));
        store.appendMessageLine('seq-a', createUserMessage('1'));
        store.appendMessageLine('seq-b', createUserMessage('2'));
        store.appendMessageLine('seq-a', createUserMessage('3'));

        const seqs = getDb()
          .query<{ seq: number }>('SELECT seq FROM messages ORDER BY seq')
          .all()
          .map((row) => row.seq);
        expect(seqs.length).toBe(3);
        expect(seqs[0] < seqs[1] && seqs[1] < seqs[2]).toBe(true);
      });

      /** 测试两个 Store 实例共享同一序号空间 */
      it('should share one seq space across store instances', () => {
        const otherAgentId = `${currentAgentId}-b`;
        const otherStore = new SessionStore(otherAgentId);
        store.createSessionFile(createMeta('shared-a'));
        otherStore.createSessionFile({
          ...createMeta('shared-b'),
          agentId: otherAgentId,
        });
        store.appendMessageLine('shared-a', createUserMessage('x'));
        otherStore.appendMessageLine('shared-b', createUserMessage('y'));

        const rows = getDb()
          .query<{
            seq: number;
          }>('SELECT seq FROM messages WHERE session_id IN (?, ?) ORDER BY seq')
          .all('shared-a', 'shared-b');
        expect(rows.length).toBe(2);
        expect(rows[1]?.seq).toBeGreaterThan(rows[0]?.seq ?? 0);
      });

      /** 测试删除会话级联清除消息行 */
      it('should cascade message deletion when deleting a session', () => {
        store.createSessionFile(createMeta('cascade'));
        store.appendMessageLine('cascade', createUserMessage('m1'));
        store.appendMessageLine('cascade', createUserMessage('m2'));

        store.deleteSessionFile('cascade');

        const row = getDb()
          .query<{
            n: number;
          }>('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?')
          .get('cascade');
        expect(row?.n).toBe(0);
      });

      /** 测试每种写操作登记一条变更行且序号单调递增 */
      it('should record one change row per mutation with increasing seq', () => {
        store.createSessionFile(createMeta('change-stream'));
        store.appendMessageLine('change-stream', createUserMessage('hi'));
        store.appendTurnEndLine('change-stream');
        store.rewriteMetaLine('change-stream', {
          ...createMeta('change-stream'),
          title: '改标题',
        });
        store.deleteSessionFile('change-stream');

        const rows = getDb()
          .query<{
            seq: number;
            kind: string;
            session_id: string;
          }>('SELECT seq, kind, session_id FROM changes ORDER BY seq')
          .all();
        expect(rows.map((r) => r.kind)).toEqual([
          'session_created',
          'message_appended',
          'turn_end',
          'session_updated',
          'session_deleted',
        ]);
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i].seq).toBeGreaterThan(rows[i - 1].seq);
        }
        expect(rows.every((r) => r.session_id === 'change-stream')).toBe(true);
      });

      /** 测试会话不存在时写入回滚，不产生变更行 */
      it('should not record change when appending to missing session', () => {
        const appended = store.appendMessageLine(
          'missing-session',
          createUserMessage('x')
        );
        expect(appended).toBe(false);

        const row = getDb()
          .query<{ n: number }>('SELECT COUNT(*) AS n FROM changes')
          .get();
        expect(row?.n).toBe(0);
      });

      /** 测试 message_appended 事件携带完整消息体 */
      it('should carry the message body in message_appended payload', () => {
        store.createSessionFile(createMeta('payload-session'));
        store.appendMessageLine(
          'payload-session',
          createUserMessage('带体消息')
        );

        const row = getDb()
          .query<{
            kind: string;
            data: string;
          }>("SELECT kind, data FROM changes WHERE kind = 'message_appended'")
          .get();
        const payload = JSON.parse(row?.data ?? '{}') as {
          seq: number;
          message: Message;
        };
        expect(payload.message.content).toBe('带体消息');
        expect(typeof payload.seq).toBe('number');
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
      getDb().run('DELETE FROM sessions');
      getDb().run('DELETE FROM changes');

      const agent = createAgentConfig(
        createTestAgentInput({ id: 'session-agent' })
      );
      agentId = agent.id;

      const agentBasePath = getAgentDir(agentId);
      const store = new SessionStore(agentId);
      manager = new SessionManager(store, agentId);
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

    /** getSessionForClient 测试 */
    describe('getSessionForClient', () => {
      /** 测试按 turnEnds 把边界条目混入 messages，内部视角不受影响 */
      it('should interleave boundary entries by turnEnds', () => {
        const created = manager.createSession();
        manager.appendMessage(created.id, { role: 'user', content: 'q1' });
        manager.appendMessage(created.id, {
          role: 'assistant',
          content: 'a1',
        });
        manager.appendTurnEnd(created.id);
        manager.appendMessage(created.id, {
          role: 'user',
          content: 'interject',
        });
        manager.appendMessage(created.id, {
          role: 'assistant',
          content: 'a2',
        });
        manager.appendTurnEnd(created.id);

        const client = manager.getSessionForClient(created.id);
        expect(client?.messages.length).toBe(6);
        // 边界条目插在标记前消息数的下标处，借用 system 角色与 turnEnd 标志
        expect(client?.messages[2]).toEqual({
          role: 'system',
          content: '',
          turnEnd: true,
        });
        expect(client?.messages[5]).toEqual({
          role: 'system',
          content: '',
          turnEnd: true,
        });
        expect(client?.messages[3]?.content).toBe('interject');

        // 内部视角不含边界，下标语义不变
        const internal = manager.getSession(created.id);
        expect(internal?.messages.length).toBe(4);
        expect(internal?.messages.some((m) => m.role === 'system')).toBe(false);
      });

      /** 测试重复下标连插边界条目，对空缓冲结组是空操作 */
      it('should tolerate duplicate marker counts', () => {
        const created = manager.createSession();
        manager.appendMessage(created.id, { role: 'user', content: 'q1' });
        manager.appendTurnEnd(created.id);
        manager.appendTurnEnd(created.id);

        const client = manager.getSessionForClient(created.id);
        expect(client?.messages.length).toBe(3);
        expect(client?.messages[1]).toEqual({
          role: 'system',
          content: '',
          turnEnd: true,
        });
        expect(client?.messages[2]).toEqual({
          role: 'system',
          content: '',
          turnEnd: true,
        });
      });

      /** 测试旧数据无标记行时原样返回 */
      it('should return session as-is for legacy files without markers', () => {
        const created = manager.createSession();
        manager.appendMessage(created.id, { role: 'user', content: 'q1' });

        const client = manager.getSessionForClient(created.id);
        expect(client?.messages.length).toBe(1);
        expect(client?.messages[0]?.role).toBe('user');
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
      getDb().run('DELETE FROM sessions');
      getDb().run('DELETE FROM changes');
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
        expect(data.sessions[0].id).toBe(
          SessionManager.chatSessionIdFor(agentId)
        );
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

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Session' }),
          }
        );

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

    /** GET /api/agents/:agentId/sessions/:id/export 测试 */
    describe('GET /api/agents/:agentId/sessions/:id/export', () => {
      /** 测试导出行数与消息数一致且每行可解析，聊天会话可导出 */
      it('should export messages as JSONL lines', async () => {
        const agentId = await createTestAgent();
        const manager = sessionManagers.get(agentId);
        if (!manager) throw new Error('Session manager missing');

        const chatId = SessionManager.chatSessionIdFor(agentId);
        manager.appendMessage(chatId, { role: 'user', content: '第一条' });
        manager.appendMessage(chatId, {
          role: 'assistant',
          content: '第二条',
        });

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/${chatId}/export`
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain(
          'application/x-ndjson'
        );
        expect(response.headers.get('content-disposition')).toBe(
          `attachment; filename="session-${chatId}.jsonl"`
        );

        const lines = (await response.text()).trim().split('\n');
        expect(lines).toHaveLength(2);
        const first = JSON.parse(lines[0]) as {
          role: string;
          content: string;
        };
        expect(first.role).toBe('user');
        expect(first.content).toBe('第一条');
        expect((JSON.parse(lines[1]) as { role: string }).role).toBe(
          'assistant'
        );
      });

      /** 测试不存在的会话导出 404 */
      it('should return 404 for non-existent session', async () => {
        const agentId = await createTestAgent();

        const response = await fetch(
          `${BASE_URL}/api/agents/${agentId}/sessions/non-existent/export`
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
