/**
 * @fileoverview 桌面端本地缓存库，服务端正本的只读镜像。
 *
 * 主进程用 node:sqlite 开库，库文件与 persona.db 同放数据根。
 * 读接口产出与 HTTP 接口同形的数据，轮次边界混入与派生时间戳在读取时现算。
 * 写入口只收快照与变更流两类服务端事实，外加角色列表的离线副本。
 */

import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  deriveSessionPreview,
  mixTurnEnds,
  type AgentConfig,
  type Message,
  type Session,
  type SessionChange,
  type SessionMeta,
  type SyncSnapshot,
} from '@persona/shared';

/**
 * node:sqlite 经 createRequire 取回，绕开 vite 系构建对内置模块前缀的解析，
 * electron 主进程与 vitest 两种环境都走 Node 运行时原生加载。
 */
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: typeof DatabaseSyncType;
};

/** 缓存 kv 里的变更流游标键 */
const CURSOR_KEY = 'sync_cursor';

/** 缓存 kv 里的镜像来源主机键 */
const SOURCE_HOST_KEY = 'source_host_id';

/** 缓存里会话行的 meta 载荷，SessionMeta 全量外加 turnEnds 边界快照 */
type SessionBlob = SessionMeta & { turnEnds?: number[] };

/** sessions 缓存行 */
interface SessionCacheRow {
  id: string;
  agent_id: string;
  updated_at: number;
  meta: string;
}

/** messages 缓存行 */
interface MessageCacheRow {
  seq: number;
  session_id: string;
  role: string;
  created_at: number;
  data: string;
}

/** message_appended 载荷，seq 为消息行号 */
interface MessageAppendedData {
  seq: number;
  message: Message;
  createdAt?: number;
}

/** session_updated 载荷，meta 全量外加派生戳与边界快照 */
type SessionUpdatedData = SessionMeta & {
  turnEnds?: number[];
  lastContextAt?: number;
  lastMessageAt?: number;
};

/**
 * 桌面缓存库。
 * 全部方法同步执行，node:sqlite 的同步 API 配合 IPC invoke 足够，
 * 事务用 BEGIN 与 COMMIT 包裹，异常时回滚。
 * 日志经构造注入，模块自身不依赖 electron，vitest 可直测。
 */
export class CacheDb {
  private readonly db: DatabaseSyncType;
  /** 镜像来源主机的标识，reset 清空 kv 后补写回 */
  private readonly sourceHostId: string;
  /** 写操作完成后的通知回调，由 IPC 层挂载 */
  onChanged: (() => void) | null = null;

  constructor(
    dbPath: string,
    sourceHostId: string,
    private readonly log: (message: string) => void = () => {}
  ) {
    this.sourceHostId = sourceHostId;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        meta TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_agent
        ON sessions (agent_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS messages (
        seq INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session
        ON messages (session_id, seq);
    `);
    // 来源主机只在空库落章，已有来源不覆盖，来源错配检测的依据
    this.db
      .prepare('INSERT OR IGNORE INTO kv (key, value) VALUES (?, ?)')
      .run(SOURCE_HOST_KEY, sourceHostId);
  }

  /** 在事务里执行，异常回滚后原样抛出 */
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** 读 kv 键值，缺失返回 null */
  private getKv(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM kv WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  /** 写 kv 键值，存在则覆盖 */
  private setKv(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  }

  private getCursorValue(): number {
    return Number(this.getKv(CURSOR_KEY) ?? 0);
  }

  private setCursorValue(value: number): void {
    this.setKv(CURSOR_KEY, String(value));
  }

  /** 当前变更流游标，零表示尚未镜像 */
  getCursor(): number {
    return this.getCursorValue();
  }

  /** 镜像来源主机的标识，连接时与服务端握手比对，错配整库作废 */
  getSourceHostId(): string | null {
    return this.getKv(SOURCE_HOST_KEY);
  }

  /** 某角色的会话元信息列表，updatedAt 排序与服务端一致 */
  listSessions(agentId: string): SessionMeta[] {
    const rows = this.db
      .prepare(
        'SELECT id, agent_id, updated_at, meta FROM sessions WHERE agent_id = ? ORDER BY updated_at DESC'
      )
      .all(agentId) as unknown as SessionCacheRow[];

    return rows.map((row) => {
      const blob = JSON.parse(row.meta) as SessionBlob;
      const meta: SessionMeta = { ...blob, updatedAt: row.updated_at };
      // chat 会话的预览由缓存现算，规则与服务端追加时维护预览列一致
      if (row.id.startsWith('chat')) {
        meta.lastMessage = this.chatPreview(row.id);
      }
      return meta;
    });
  }

  /** 从消息尾部提取聊天会话预览 */
  private chatPreview(sessionId: string): string | undefined {
    const rows = this.db
      .prepare(
        `SELECT data FROM messages WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY seq DESC LIMIT 20`
      )
      .all(sessionId) as unknown as Array<{ data: string }>;
    const tail = rows.map((r) => JSON.parse(r.data) as Message).reverse();
    return deriveSessionPreview(tail);
  }

  /** 完整会话，形状与 HTTP 详情接口一致，含轮次边界条目 */
  getSession(id: string): Session | null {
    const row = this.db
      .prepare(
        'SELECT id, agent_id, updated_at, meta FROM sessions WHERE id = ?'
      )
      .get(id) as unknown as SessionCacheRow | undefined;
    if (!row) return null;

    const blob = JSON.parse(row.meta) as SessionBlob;
    const messageRows = this.db
      .prepare(
        'SELECT seq, session_id, role, created_at, data FROM messages WHERE session_id = ? ORDER BY seq'
      )
      .all(id) as unknown as MessageCacheRow[];

    const messages: Message[] = [];
    let lastContextAt: number | undefined;
    let lastMessageAt: number | undefined;
    for (const messageRow of messageRows) {
      const message = JSON.parse(messageRow.data) as Message;
      message.seq = messageRow.seq;
      messages.push(message);
      if (messageRow.role === 'context') {
        lastContextAt = messageRow.created_at;
      } else {
        lastMessageAt = messageRow.created_at;
      }
    }

    return {
      ...blob,
      updatedAt: row.updated_at,
      lastContextAt,
      lastMessageAt,
      messages: mixTurnEnds(messages, blob.turnEnds),
    };
  }

  /** 缓存的角色列表，离线回退用 */
  listAgents(): AgentConfig[] {
    const rows = this.db
      .prepare('SELECT data FROM agents')
      .all() as unknown as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as AgentConfig);
  }

  /** 全量快照整体入库，先清空再装载，游标推进到快照序号 */
  applySnapshot(snapshot: SyncSnapshot): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM messages');
      this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM agents');
      const insertSession = this.db.prepare(
        'INSERT INTO sessions (id, agent_id, updated_at, meta) VALUES (?, ?, ?, ?)'
      );
      const insertMessage = this.db.prepare(
        'INSERT INTO messages (seq, session_id, role, created_at, data) VALUES (?, ?, ?, ?, ?)'
      );
      for (const session of snapshot.sessions) {
        const { messages, ...rest } = session;
        insertSession.run(
          session.id,
          session.agentId,
          session.updatedAt,
          JSON.stringify(rest)
        );
        for (const m of messages) {
          insertMessage.run(
            m.seq,
            session.id,
            m.message.role,
            m.createdAt,
            JSON.stringify(m.message)
          );
        }
      }
      // 角色清单随快照整体装载，离线可见与跨主机切换都依赖它
      const insertAgent = this.db.prepare(
        'INSERT INTO agents (id, data) VALUES (?, ?)'
      );
      for (const agent of snapshot.agents) {
        insertAgent.run(agent.id, JSON.stringify(agent));
      }
      this.setCursorValue(snapshot.latestSeq);
    });
    this.log(
      `[Cache] Applied snapshot: ${snapshot.sessions.length} sessions ${snapshot.agents.length} agents latestSeq=${snapshot.latestSeq}`
    );
    this.onChanged?.();
  }

  /** 按序回放变更流，游标之前的事件跳过，消息按行号幂等 */
  applyChanges(changes: SessionChange[]): void {
    let cursor = this.getCursorValue();
    let applied = 0;
    this.transaction(() => {
      for (const change of changes) {
        if (change.seq <= cursor) continue;
        this.applyChange(change);
        cursor = change.seq;
        applied++;
      }
      if (applied > 0) this.setCursorValue(cursor);
    });
    if (applied > 0) {
      this.log(`[Cache] Applied ${applied} changes, cursor=${cursor}`);
      this.onChanged?.();
    }
  }

  /** 回放单个变更事件，载荷缺失时记日志跳过 */
  private applyChange(change: SessionChange): void {
    const sessionId = change.sessionId;
    switch (change.kind) {
      case 'session_created':
      case 'session_updated': {
        if (!sessionId) return;
        const payload = change.data as SessionUpdatedData;
        const { lastContextAt: _c, lastMessageAt: _m, ...blob } = payload;
        this.db
          .prepare(
            'INSERT INTO sessions (id, agent_id, updated_at, meta) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET agent_id = excluded.agent_id, updated_at = excluded.updated_at, meta = excluded.meta'
          )
          .run(
            payload.id,
            payload.agentId,
            payload.updatedAt,
            JSON.stringify(blob)
          );
        return;
      }
      case 'message_appended': {
        if (!sessionId) return;
        const payload = change.data as Partial<MessageAppendedData>;
        if (!payload.message || typeof payload.seq !== 'number') {
          // 旧格式事件不带消息体，快照已覆盖其内容，跳过即可
          this.log(
            `[Cache] Skip message_appended without payload seq=${change.seq}`
          );
          return;
        }
        this.db
          .prepare(
            'INSERT OR IGNORE INTO messages (seq, session_id, role, created_at, data) VALUES (?, ?, ?, ?, ?)'
          )
          .run(
            payload.seq,
            sessionId,
            payload.message.role,
            payload.createdAt ?? change.createdAt,
            JSON.stringify(payload.message)
          );
        this.db
          .prepare(
            'UPDATE sessions SET updated_at = MAX(updated_at, ?) WHERE id = ?'
          )
          .run(change.createdAt, sessionId);
        return;
      }
      case 'turn_end': {
        if (!sessionId) return;
        const payload = change.data as { turnEnds?: number[] };
        const row = this.db
          .prepare('SELECT meta FROM sessions WHERE id = ?')
          .get(sessionId) as unknown as { meta: string } | undefined;
        if (!row) return;
        const blob = JSON.parse(row.meta) as SessionBlob;
        blob.turnEnds = payload.turnEnds;
        this.db
          .prepare('UPDATE sessions SET meta = ? WHERE id = ?')
          .run(JSON.stringify(blob), sessionId);
        return;
      }
      case 'session_deleted': {
        if (!sessionId) return;
        this.db
          .prepare('DELETE FROM messages WHERE session_id = ?')
          .run(sessionId);
        this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        return;
      }
      case 'agents_invalidated':
        // 事件体不带增量数据，游标照常前进，渲染层收 WS 事件后整份重拉角色清单
        return;
      default:
        this.log(
          `[Cache] Unknown change kind ${change.kind} seq=${change.seq}`
        );
    }
  }

  /** 角色列表整体替换 */
  putAgents(agents: AgentConfig[]): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM agents');
      const insert = this.db.prepare(
        'INSERT INTO agents (id, data) VALUES (?, ?)'
      );
      for (const agent of agents) {
        insert.run(agent.id, JSON.stringify(agent));
      }
    });
    this.onChanged?.();
  }

  /** 删除某角色的全部缓存行，角色删除不在变更流范围，由渲染层显式触发 */
  deleteAgent(agentId: string): void {
    const ids = this.db
      .prepare('SELECT id FROM sessions WHERE agent_id = ?')
      .all(agentId) as unknown as Array<{ id: string }>;
    this.transaction(() => {
      for (const { id } of ids) {
        this.db.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
      }
      this.db.prepare('DELETE FROM sessions WHERE agent_id = ?').run(agentId);
      this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    });
    this.log(`[Cache] Deleted agent cache rows: ${agentId}`);
    this.onChanged?.();
  }

  /** 清空全部缓存数据，游标归零，来源主机标识保留 */
  reset(): void {
    this.transaction(() => {
      this.db.exec('DELETE FROM messages');
      this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM agents');
      this.db.exec('DELETE FROM kv');
      this.setKv(SOURCE_HOST_KEY, this.sourceHostId);
    });
    this.log('[Cache] Reset all cache data');
    this.onChanged?.();
  }

  /** 关闭库连接，应用退出前调用 */
  close(): void {
    this.db.close();
  }
}
