/**
 * @fileoverview memory 工具壳，四个动作各自一个类。
 *
 * write、update、forget、search 共用 MemoryStore 与 shared 的输入校验，
 * 参数表按动作拆小，参数说明不再声明服务于哪个动作，模型选中功能就选中了参数表。
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

export const MEMORY_WRITE_DESCRIPTION = `Save one new memory entry about the user. Entries persist across all sessions and matching memories are injected into the conversation automatically.

What to save:
  - Durable facts about the user: studies, work, family, preferences, plans, important dates
  - Dated events: what the user attended or scheduled on a specific day
  - Your own conclusions, recommendations, and promises, and things you did together with the user
  - Anything the user asks you to remember

What not to save:
  - Anything that is not a durable fact about the user
  - Task progress, session outcomes, temporary todos
  - Anything that happened or was observed during the current turn
  - General knowledge the user never stated
  - Facts already recorded. If write reports a duplicate, update that entry instead

Conduct:
  - Record only what was actually said or happened. Do not infer, embellish, or invent
  - Before writing, ask whether this will still hold later`;

export const MEMORY_UPDATE_DESCRIPTION = `Change one existing memory entry by uid, passing only the fields to change. When the user changes their story, update the old entry here instead of keeping both versions.`;

export const MEMORY_FORGET_DESCRIPTION = `Remove one memory entry by uid. Effective immediately.`;

export const MEMORY_SEARCH_DESCRIPTION = `Find memory entries by keywords over title, content and keys. Matching memories reach you automatically each turn. When the user refers to the past and you are unsure, search before you answer. Empty query lists all enabled entries. When keyword searches keep coming back empty, run one with an empty query and scan all entries before you say you do not remember.`;

export const MEMORY_WRITE_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    content: {
      type: 'string',
      description:
        'The memory text, in the language of the conversation. One self-contained sentence about one thing: write each fact the moment it appears in the conversation, not a summary afterwards, and never pack several facts into one entry. Keep exact figures and dates as they were said, amounts, counts, sizes, scheduled days, and do not round or drop them, because later questions often ask for the exact value',
    },
    keys: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Trigger words under which this memory resurfaces. Required for triggered entries, omit or pass empty for pinned. Choose the words the user will actually use when this topic comes back, and cover both Chinese and English for the same thing, so a message in either language can trigger this memory',
    },
    title: {
      type: 'string',
      description:
        'A short standalone label naming the topic of this entry, in the language of the conversation. Keep it 2 to 10 characters for Chinese or 2 to 6 words for English, a complete word or phrase that reads naturally in a list. Never copy the opening of the content, never cut a sentence in half, and never use emoji or decorative symbols',
    },
    type: {
      type: 'string',
      enum: ['pinned', 'triggered'],
      description:
        'Pinned entries are always injected, triggered entries inject when a key matches. Defaults to triggered',
    },
  },
  required: ['content', 'title'],
};

export const MEMORY_UPDATE_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    uid: {
      type: 'number',
      description: 'The entry number to change. Run search first when unknown',
    },
    title: {
      type: 'string',
      description: 'New short label naming the topic of this entry',
    },
    content: {
      type: 'string',
      description: 'New memory text replacing the old one',
    },
    keys: {
      type: 'array',
      items: { type: 'string' },
      description: 'New trigger words replacing the old set',
    },
    type: {
      type: 'string',
      enum: ['pinned', 'triggered'],
      description: 'Switch the entry between always injected and key matched',
    },
    enabled: {
      type: 'boolean',
      description: 'Set false to keep the entry on file but stop injecting it',
    },
  },
  required: ['uid'],
};

export const MEMORY_FORGET_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    uid: {
      type: 'number',
      description: 'The entry number to remove. Run search first when unknown',
    },
  },
  required: ['uid'],
};

export const MEMORY_SEARCH_PARAMETERS: JsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Keywords matched against title, content and keys. The query splits into words and any one word matching returns the entry, so pack synonyms of both Chinese and English into one query, like workshop 工作坊 培训. Empty query lists all enabled entries',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of entries to return. Defaults to 20',
    },
  },
  required: [],
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
 * 四个动作共用的执行壳，构造时绑定人格。
 *
 * 每次执行新建 MemoryStore，文件不存在时构造器自建目录，无状态可缓存。
 */
abstract class MemoryActionTool implements Tool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: JsonSchema;

  constructor(protected readonly agentId: string) {}

  protected abstract run(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult;

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const store = new MemoryStore(this.agentId);
    Logger.log('MEMORY', 'Tool invoked', {
      agentId: this.agentId,
      tool: this.name,
    });
    return this.run(store, params);
  }
}

/** write，撞重不算失败，附已有条目引导模型改走 update */
export class MemoryWriteTool extends MemoryActionTool {
  readonly name = 'write';
  readonly description = MEMORY_WRITE_DESCRIPTION;
  readonly parameters = MEMORY_WRITE_PARAMETERS;

  protected run(
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
        content: `Already recorded as #${result.entry.uid}: ${result.entry.content}. Use built_in_memory__update with uid ${result.entry.uid} if you want to change it.`,
      };
    }
    return { success: false, content: '', error: result.message };
  }
}

/** update，成功回改后的完整条目，未找到引导先 search */
export class MemoryUpdateTool extends MemoryActionTool {
  readonly name = 'update';
  readonly description = MEMORY_UPDATE_DESCRIPTION;
  readonly parameters = MEMORY_UPDATE_PARAMETERS;

  protected run(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const uid = takeUid(params);
    if (uid === undefined) {
      return {
        success: false,
        content: '',
        error:
          'uid must be a positive integer. Run built_in_memory__search first when unknown.',
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
        content: `No entry #${uid}. Use built_in_memory__search to find the uid first.`,
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
}

/** forget，成功回被删条目原文供核对 */
export class MemoryForgetTool extends MemoryActionTool {
  readonly name = 'forget';
  readonly description = MEMORY_FORGET_DESCRIPTION;
  readonly parameters = MEMORY_FORGET_PARAMETERS;

  protected run(
    store: MemoryStore,
    params: Record<string, unknown>
  ): ToolResult {
    const uid = takeUid(params);
    if (uid === undefined) {
      return {
        success: false,
        content: '',
        error:
          'uid must be a positive integer. Run built_in_memory__search first when unknown.',
      };
    }
    const entries = store.listEntries();
    const target = entries.find((entry) => entry.uid === uid);
    if (!target || !store.forgetEntry(uid)) {
      return {
        success: true,
        content: `No entry #${uid}. Use built_in_memory__search to find the uid first.`,
      };
    }
    return { success: true, content: `Forgotten #${uid}: ${target.content}` };
  }
}

/** search，条目列表按编号升序，空结果显式说明 */
export class MemorySearchTool extends MemoryActionTool {
  readonly name = 'search';
  readonly description = MEMORY_SEARCH_DESCRIPTION;
  readonly parameters = MEMORY_SEARCH_PARAMETERS;

  protected run(
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
