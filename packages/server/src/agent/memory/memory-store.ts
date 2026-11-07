/**
 * @fileoverview Agent 记忆存储：每行一条记忆条目的 memory.jsonl。
 *
 * 存储结构：
 * ```
 * ├── memory.jsonl   # 每行一个八字段条目对象，无外层包装
 * └── .next_uid      # 已分配出去的最大编号，只进不退
 * ```
 *
 * 写路径全同步纪律：三个写方法全程同步 fs API，方法体内不插任何
 * await。同步方法在单线程运行时里不可分割，同人格双端同时写实际
 * 在事件循环里排队执行，单进程内不存在丢更新窗口。这条不变量以
 * 单进程为前提，将来引入多进程需重审。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  MemoryEntry,
  MemoryUpdateInput,
  MemoryWriteInput,
} from '@persona/shared';
import { getAgentMemoryDir } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';

/** 条目存储的主文件，一行一个八字段条目对象 */
const ENTRIES_FILE = 'memory.jsonl';
/** 编号计数器文件，删除条目不释放编号，防止旧编号指向后来的新条目 */
const NEXT_UID_FILE = '.next_uid';
/** 标题缺省时截取内容开头的字符数，与界面编辑行为同口径 */
const TITLE_SLICE_CHARS = 12;

/**
 * 常驻板块标题行，英文引导语告诉模型这些是跨会话的持久事实。
 * 条目内容保持原语言，标题与触发词不进注入。
 */
const PINNED_HEADER =
  '[Memory] Durable facts you have learned about the user. They persist across sessions. Rely on them to stay consistent and do not re-ask what you already know.';

/** writeEntry 的三种出口 */
export type MemoryWriteResult =
  | { ok: true; entry: MemoryEntry }
  | { ok: false; kind: 'duplicate'; entry: MemoryEntry }
  | { ok: false; kind: 'invalid'; message: string };

/** updateEntry 的四种出口 */
export type MemoryUpdateResult =
  | { ok: true; entry: MemoryEntry }
  | { ok: false; kind: 'notFound' }
  | { ok: false; kind: 'duplicate'; entry: MemoryEntry }
  | { ok: false; kind: 'invalid'; message: string };

/** 条目行，短横线开头，learned 日期前缀让模型判断时效，日期取 createdAt 前十位 */
export function formatEntryLine(entry: MemoryEntry): string {
  return `- (learned ${entry.createdAt.slice(0, 10)}) ${entry.content}`;
}

/**
 * 常驻板块文本，标题行加条目行。
 *
 * 空态返回空串，由调用方整块跳过。
 */
export function buildPinnedSegment(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';
  return `${PINNED_HEADER}\n${entries.map(formatEntryLine).join('\n')}`;
}

export class MemoryStore {
  private readonly memoryDir: string;
  private readonly agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.memoryDir = getAgentMemoryDir(agentId);
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  // ===== 条目存储 API =====

  /** 全量条目，编号升序，坏行跳过 */
  listEntries(): MemoryEntry[] {
    return this.readEntriesFile();
  }

  /** 常驻启用条目，编号升序，注入用 */
  listPinnedEnabled(): MemoryEntry[] {
    return this.readEntriesFile().filter(
      (entry) => entry.type === 'pinned' && entry.enabled
    );
  }

  /** 触发启用条目，编号升序，注入用 */
  listTriggeredEnabled(): MemoryEntry[] {
    return this.readEntriesFile().filter(
      (entry) => entry.type === 'triggered' && entry.enabled
    );
  }

  /**
   * 新增一条记忆。
   *
   * 写路径走全同步纪律，方法体内无 await。查重三步是 trim、toLowerCase、
   * content 全等，只比 content 不比 keys。工具通道走前置查重，用户通道
   * 传 skipDedup 想记重复随他。时间章在此盖，write 双时间戳同值。
   */
  writeEntry(
    input: MemoryWriteInput,
    opts?: { skipDedup?: boolean }
  ): MemoryWriteResult {
    const content = input.content.trim();
    if (!opts?.skipDedup) {
      const duplicate = this.findDuplicate(content);
      if (duplicate) {
        Logger.log('MEMORY', 'Write rejected as duplicate', {
          agentId: this.agentId,
          uid: duplicate.uid,
        });
        return { ok: false, kind: 'duplicate', entry: duplicate };
      }
    }
    const keys = input.keys.map((k) => k.trim()).filter(Boolean);
    const invalid = validateKeys(input.type, keys);
    if (invalid) return { ok: false, kind: 'invalid', message: invalid };

    const entries = this.readEntriesFile();
    const now = new Date().toISOString();
    const entry: MemoryEntry = {
      uid: this.allocateUid(entries),
      title: input.title?.trim() || content.slice(0, TITLE_SLICE_CHARS),
      content,
      keys,
      type: input.type,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
    };
    fs.appendFileSync(
      path.join(this.memoryDir, ENTRIES_FILE),
      JSON.stringify(entry) + '\n'
    );
    Logger.log('MEMORY', 'Entry written', {
      agentId: this.agentId,
      uid: entry.uid,
      type: entry.type,
    });
    return { ok: true, entry };
  }

  /**
   * 按编号改一条记忆，patch 只含给出的字段。
   *
   * 写路径走全同步纪律，方法体内无 await。update 只刷新 updatedAt。
   * patch 含 content 时跑同一套查重，撞重且不是自己这条则拒绝，
   * 防止改出两条同文条目。
   */
  updateEntry(uid: number, patch: MemoryUpdateInput): MemoryUpdateResult {
    const entries = this.readEntriesFile();
    const index = entries.findIndex((entry) => entry.uid === uid);
    if (index === -1) {
      Logger.log('MEMORY', 'Update target not found', {
        agentId: this.agentId,
        uid,
      });
      return { ok: false, kind: 'notFound' };
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as Partial<MemoryEntry>;
    const next: MemoryEntry = { ...entries[index]!, ...clean };
    if (clean.content !== undefined) next.content = next['content'].trim();
    if (clean.keys !== undefined)
      next.keys = next['keys'].map((k) => k.trim()).filter(Boolean);

    const invalid = validateKeys(next.type, next.keys);
    if (invalid) return { ok: false, kind: 'invalid', message: invalid };

    if (clean.content !== undefined) {
      const duplicate = this.findDuplicateIn(entries, next.content, uid);
      if (duplicate) {
        Logger.log('MEMORY', 'Update rejected as duplicate', {
          agentId: this.agentId,
          uid,
          duplicateUid: duplicate.uid,
        });
        return { ok: false, kind: 'duplicate', entry: duplicate };
      }
    }

    next.updatedAt = new Date().toISOString();
    entries[index] = next;
    this.writeEntriesFile(entries);
    Logger.log('MEMORY', 'Entry updated', { agentId: this.agentId, uid });
    return { ok: true, entry: next };
  }

  /**
   * 按编号删一条记忆，遗忘当场生效。
   *
   * 写路径走全同步纪律，方法体内无 await。编号不回收。
   */
  forgetEntry(uid: number): boolean {
    const entries = this.readEntriesFile();
    const next = entries.filter((entry) => entry.uid !== uid);
    if (next.length === entries.length) {
      Logger.log('MEMORY', 'Forget target not found', {
        agentId: this.agentId,
        uid,
      });
      return false;
    }
    this.writeEntriesFile(next);
    Logger.log('MEMORY', 'Entry forgotten', { agentId: this.agentId, uid });
    return true;
  }

  /**
   * 关键词查，查询串按空白切词，任一词在 content 或 keys 命中即返回。
   *
   * 大小写不敏感，空查询列全部启用条目，带查询查全量含停用，
   * 供模型在 update 与 forget 前找回 uid。整串当连续子串匹配的旧
   * 语义会让多词查询必然落空，故改为分词后任一命中。
   */
  searchEntries(query: string, limit = 20): MemoryEntry[] {
    const entries = this.readEntriesFile();
    const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pool =
      keywords.length > 0 ? entries : entries.filter((entry) => entry.enabled);
    const matched =
      keywords.length > 0
        ? pool.filter((entry) => {
            const content = entry.content.toLowerCase();
            return keywords.some(
              (word) =>
                content.includes(word) ||
                entry.keys.some((key) => key.toLowerCase().includes(word))
            );
          })
        : pool;
    Logger.log('MEMORY', 'Search', {
      agentId: this.agentId,
      keywords: keywords.length,
      hits: matched.length,
    });
    return matched.slice(0, limit);
  }

  /**
   * 读条目文件，坏行跳过并记 log。
   *
   * JSON.parse 失败、uid 非正整数、content 缺失的行直接跳过，
   * 其余条目照常工作，手工写入残行不影响读写。
   */
  private readEntriesFile(): MemoryEntry[] {
    const filePath = path.join(this.memoryDir, ENTRIES_FILE);
    if (!fs.existsSync(filePath)) return [];
    const lines = fs
      .readFileSync(filePath, 'utf8')
      .split('\n')
      .filter((line) => line.trim());
    const entries: MemoryEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as MemoryEntry;
        if (
          !Number.isInteger(parsed.uid) ||
          parsed.uid <= 0 ||
          typeof parsed.content !== 'string' ||
          !parsed.content
        ) {
          throw new Error('corrupt entry');
        }
        entries.push(parsed);
      } catch {
        Logger.log('MEMORY', 'Skipped corrupt line', {
          agentId: this.agentId,
          line,
        });
      }
    }
    return entries;
  }

  /** 全量重写条目文件，tmp 加 rename 原子替换，与 agent-config-store 同款模式 */
  private writeEntriesFile(entries: MemoryEntry[]): void {
    const filePath = path.join(this.memoryDir, ENTRIES_FILE);
    const tmpPath = `${filePath}.tmp`;
    const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
    fs.writeFileSync(tmpPath, body.length > 0 ? body + '\n' : '');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 分配下一个编号。
   *
   * 取计数器与现有最大编号的较大者加一，计数器只进不退，
   * 删除条目后编号不复用。
   */
  private allocateUid(entries: MemoryEntry[]): number {
    const filePath = path.join(this.memoryDir, NEXT_UID_FILE);
    let counter = 0;
    if (fs.existsSync(filePath)) {
      const parsed = Number(fs.readFileSync(filePath, 'utf8').trim());
      if (Number.isFinite(parsed) && parsed > 0) counter = Math.floor(parsed);
    }
    const maxExisting =
      entries.length > 0 ? entries[entries.length - 1]!.uid : 0;
    const next = Math.max(counter, maxExisting) + 1;
    fs.writeFileSync(filePath, String(next));
    return next;
  }

  /** 查重三步：trim、toLowerCase、content 全等，只比 content 不比 keys */
  private findDuplicate(content: string): MemoryEntry | undefined {
    return this.findDuplicateIn(this.readEntriesFile(), content);
  }

  /** 在给定条目集内查重，excludeUid 用于 update 场景跳过自己这条 */
  private findDuplicateIn(
    entries: MemoryEntry[],
    content: string,
    excludeUid?: number
  ): MemoryEntry | undefined {
    const normalized = content.trim().toLowerCase();
    return entries.find(
      (entry) =>
        entry.uid !== excludeUid &&
        entry.content.trim().toLowerCase() === normalized
    );
  }
}

/**
 * keys 校验：type 为 triggered 时 keys 不能是空数组。
 *
 * pinned 改 triggered 的 patch 同样要求，防止没有触发词的哑条目。
 */
function validateKeys(
  type: MemoryEntry['type'],
  keys: string[]
): string | null {
  if (type === 'triggered' && keys.length === 0) {
    return 'triggered entry requires at least one key';
  }
  return null;
}
