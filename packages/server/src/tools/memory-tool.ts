/**
 * @fileoverview memory 工具壳：模型读写记忆条目的唯一通道。
 *
 * 四动作 write、update、forget、search 共用一个参数 schema，参数经
 * shared 的输入 schema 校验整理，与用户通道的管理接口同一套规则。
 * 返回文本是英文框架词加条目原文语言，模型读得懂即可，不抛异常，
 * 参数错误统一回 success false 加 error 说明。
 */
import type { JsonSchema, Tool, ToolResult } from './base.js';
import { MemoryStore } from '../agent/memory/memory-store.js';
import type { MemoryEntry } from '@persona/shared';
import {
  MemoryUpdateInputSchema,
  MemoryWriteInputSchema,
} from '@persona/shared';
import { Logger } from '../util/logger.js';

/** 工具描述成文，版式照 bash 工具的分段写法 */
export const MEMORY_TOOL_DESCRIPTION = `Manage this persona's long-term memory about the user. Entries persist
across all sessions and matching memories are injected into the
conversation automatically. This tool is the only way to change them.

Actions:
  - write: Save a new memory.
  - update: Change one existing entry by uid, passing only the fields
    to change.
  - forget: Remove one entry by uid. Effective immediately.
  - search: Find entries by keywords over content and keys.

What to save:
  - Durable facts about the user: studies, work, family, preferences,
    plans, important dates
  - Dated events: what the user attended or scheduled on a specific day
  - Your own conclusions, recommendations, and promises, and things you
    did together with the user
  - Anything the user asks you to remember

What not to save:
  - Task progress, session outcomes, temporary todos
  - Chatter that only matters for the current turn
  - General knowledge the user never stated
  - Facts already recorded. If write reports a duplicate, update that
    entry instead

Conduct:
  - Record only what was actually said or happened. Do not infer,
    embellish, or invent
  - Save silently and mention it in passing at most. Never narrate the
    saving process, never ask permission
  - Before writing, ask whether this will still hold later. When the user
    changes their story, update the old entry instead of keeping both
    versions
  - Matching memories reach you automatically each turn. When the user
    refers to the past and you are unsure, search before you answer`;

/** 参数 schema 成文，内置工具同款形态，每个参数标注归属哪个动作 */
export const MEMORY_TOOL_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['write', 'update', 'forget', 'search'],
      description:
        'The operation to perform. write saves a new entry, update changes one existing entry, forget removes an entry, search lists entries',
    },
    content: {
      type: 'string',
      description:
        'write and update: the memory text, in the language of the conversation. One self-contained sentence about one thing: write each fact the moment it appears in the conversation, not a summary afterwards, and never pack several facts into one entry. Keep exact figures and dates as they were said, amounts, counts, sizes, scheduled days, and do not round or drop them, because later questions often ask for the exact value',
    },
    keys: {
      type: 'array',
      items: { type: 'string' },
      description:
        'write and update: trigger words under which this memory resurfaces. Required for triggered entries, omit or pass empty for pinned. Choose the words the user will actually use when this topic comes back, and cover both Chinese and English for the same thing, so a message in either language can trigger this memory',
    },
    title: {
      type: 'string',
      description:
        'write and update: required. A short standalone label naming the topic of this entry, in the language of the conversation. Keep it 2 to 10 characters for Chinese or 2 to 6 words for English, a complete word or phrase that reads naturally in a list. Never copy the opening of the content, never cut a sentence in half, and never use emoji or decorative symbols',
    },
    type: {
      type: 'string',
      enum: ['pinned', 'triggered'],
      description:
        'write and update: pinned entries are always injected, triggered entries inject when a key matches. Defaults to triggered',
    },
    enabled: {
      type: 'boolean',
      description:
        'update: set false to keep the entry on file but stop injecting it',
    },
    uid: {
      type: 'number',
      description:
        'update and forget: the entry number to act on. Run search first when unknown',
    },
    query: {
      type: 'string',
      description:
        'search: keywords matched against title, content and keys. The query splits into words and any one word matching returns the entry, so pack synonyms of both Chinese and English into one query, like workshop 工作坊 培训. Empty query lists all enabled entries. When keyword searches keep coming back empty, run one with an empty query and scan all entries before you say you do not remember',
    },
    limit: {
      type: 'number',
      description:
        'search: maximum number of entries to return. Defaults to 20',
    },
  },
  required: ['action'],
};

/**
 * 条目的单行描述，update 与 search 共用同一行式。
 *
 * pinned 条目没有触发词，省略 keys 段。
 */
function describeEntry(entry: MemoryEntry): string {
  const base = `#${entry.uid} [${entry.type}] ${entry.content}`;
  return entry.keys.length > 0
    ? `${base} (keys: ${entry.keys.join(', ')})`
    : base;
}

/** 从 params 取正整数 uid，非法时返回 undefined */
function takeUid(params: Record<string, unknown>): number | undefined {
  const raw = params['uid'];
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  return undefined;
}

/** zod issue 列表压成一句英文说明 */
function describeIssues(
  issues: { path: PropertyKey[]; message: string }[]
): string {
  const first = issues[0];
  return first
    ? `Invalid parameter at ${String(first.path[0] ?? '')}: ${first.message}`
    : 'Invalid parameters';
}

/**
 * memory 工具，构造时绑定人格。
 *
 * 每次执行新建 MemoryStore，文件不存在时构造器自建目录，无状态可缓存。
 */
export class MemoryTool implements Tool {
  public readonly name = 'memory';
  public readonly description = MEMORY_TOOL_DESCRIPTION;
  public readonly parameters = MEMORY_TOOL_PARAMETERS;

  constructor(private readonly agentId: string) {}

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params['action'];
    const store = new MemoryStore(this.agentId);
    Logger.log('MEMORY', 'Tool invoked', { agentId: this.agentId, action });

    switch (action) {
      case 'write':
        return this.runWrite(store, params);
      case 'update':
        return this.runUpdate(store, params);
      case 'forget':
        return this.runForget(store, params);
      case 'search':
        return this.runSearch(store, params);
      default:
        return {
          success: false,
          content: '',
          error: 'Unknown action. Use write, update, forget or search.',
        };
    }
  }

  /** write 动作：撞重不算失败，附已有条目引导模型改走 update */
  private runWrite(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const parsed = MemoryWriteInputSchema.safeParse({
      content: params['content'],
      keys: params['keys'] ?? [],
      title: params['title'],
      type: params['type'],
      enabled: true,
    });
    if (!parsed.success) {
      return {
        success: false,
        content: '',
        error: describeIssues(parsed.error.issues),
      };
    }
    const result = store.writeEntry(parsed.data);
    if (result.ok) {
      return {
        success: true,
        content: `Recorded as #${result.entry.uid}. It will be injected from the next turn.`,
      };
    }
    if (result.kind === 'duplicate') {
      return {
        success: true,
        content: `Already recorded as #${result.entry.uid}: ${result.entry.content}. Use update #${result.entry.uid} if you want to change it.`,
      };
    }
    return { success: false, content: '', error: result.message };
  }

  /** update 动作：成功回改后的完整条目，未找到引导先 search */
  private runUpdate(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const uid = takeUid(params);
    if (uid === undefined) {
      return {
        success: false,
        content: '',
        error: 'uid must be a positive integer. Run search first when unknown.',
      };
    }
    const parsed = MemoryUpdateInputSchema.safeParse({
      title: params['title'],
      content: params['content'],
      keys: params['keys'],
      type: params['type'],
      enabled: params['enabled'],
    });
    if (!parsed.success) {
      return {
        success: false,
        content: '',
        error: describeIssues(parsed.error.issues),
      };
    }
    const result = store.updateEntry(uid, parsed.data);
    if (result.ok) {
      return {
        success: true,
        content: `Updated ${describeEntry(result.entry)}`,
      };
    }
    if (result.kind === 'notFound') {
      return {
        success: true,
        content: `No entry #${uid}. Use search to find the uid first.`,
      };
    }
    if (result.kind === 'duplicate') {
      return {
        success: false,
        content: '',
        error: `Another entry #${result.entry.uid} already has this content. Update that one instead.`,
      };
    }
    return { success: false, content: '', error: result.message };
  }

  /** forget 动作：成功回被删条目原文供核对 */
  private runForget(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const uid = takeUid(params);
    if (uid === undefined) {
      return {
        success: false,
        content: '',
        error: 'uid must be a positive integer. Run search first when unknown.',
      };
    }
    const entries = store.listEntries();
    const target = entries.find((entry) => entry.uid === uid);
    if (!target || !store.forgetEntry(uid)) {
      return {
        success: true,
        content: `No entry #${uid}. Use search to find the uid first.`,
      };
    }
    return { success: true, content: `Forgotten #${uid}: ${target.content}` };
  }

  /** search 动作：条目列表按编号升序，空结果显式说明 */
  private runSearch(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const query = typeof params['query'] === 'string' ? params['query'] : '';
    const rawLimit = params['limit'];
    const limit =
      typeof rawLimit === 'number' && Number.isInteger(rawLimit) && rawLimit > 0
        ? rawLimit
        : 20;
    const entries = store.searchEntries(query, limit);
    if (entries.length === 0) {
      return { success: true, content: 'No matching entries.' };
    }
    return { success: true, content: entries.map(describeEntry).join('\n') };
  }
}
