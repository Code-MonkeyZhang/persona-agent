/**
 * @fileoverview 记忆条目的领域模型与输入校验 schema。
 *
 * server 的存储芯与 desktop 的管理页共用此定义，
 * mobile 是独立仓，在 server-api.ts 手写同构类型。
 */
import { z } from 'zod';

/**
 * 记忆条目类型。
 *
 * - pinned: 常驻条目，每轮注入 system prompt 尾部
 * - triggered: 触发条目，命中触发词后进相关记忆节
 */
export type MemoryType = 'pinned' | 'triggered';

/** memory.jsonl 单行条目的八字段 schema */
export const MemoryEntrySchema = z.object({
  /** 编号，追加式分配取现有最大加一 */
  uid: z.number().int().positive(),
  /** 标题，必填的简短话题标签 */
  title: z.string(),
  /** 正文，一条自含句 */
  content: z.string().min(1),
  /** 触发词，pinned 条目为空数组 */
  keys: z.array(z.string()),
  type: z.enum(['pinned', 'triggered']),
  /** 启停，停用条目留在文件但不注入 */
  enabled: z.boolean(),
  /** 记于，服务端盖的 ISO 8601 UTC 时间章 */
  createdAt: z.string(),
  /** 改于，服务端盖的 ISO 8601 UTC 时间章 */
  updatedAt: z.string(),
});

/** 记忆条目类型 */
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/**
 * 新增输入。title 与 content 必填，keys 缺省空数组，
 * type 缺省 triggered，enabled 缺省 true，时间章由服务端盖。
 */
export const MemoryWriteInputSchema = z.object({
  content: z.string().min(1),
  keys: z.array(z.string()).default([]),
  title: z.string().trim().min(1, 'title is required'),
  type: z.enum(['pinned', 'triggered']).default('triggered'),
  enabled: z.boolean().default(true),
});

/** 新增输入类型 */
export type MemoryWriteInput = z.infer<typeof MemoryWriteInputSchema>;

/**
 * 更新输入。全部可写字段可选，至少一个字段。
 * uid 不在输入面，由调用通道的路径参数或工具参数携带。
 */
export const MemoryUpdateInputSchema = z
  .object({
    title: z.string().trim().min(1, 'title cannot be empty').optional(),
    content: z.string().min(1).optional(),
    keys: z.array(z.string()).optional(),
    type: z.enum(['pinned', 'triggered']).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

/** 更新输入类型 */
export type MemoryUpdateInput = z.infer<typeof MemoryUpdateInputSchema>;
