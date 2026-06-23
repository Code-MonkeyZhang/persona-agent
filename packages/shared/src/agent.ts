import { z } from 'zod';
import { ModelConfigSchema } from './model-config.js';

/** Agent configuration schema */
export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  systemPrompt: z.string(),
  defaultModel: ModelConfigSchema,
  maxSteps: z.number().int().positive(),
  defaultWorkspacePath: z.string().optional(),
  skillNames: z.array(z.string()).default([]),
  mcpNames: z.array(z.string()).default([]),
  /**
   * 上下文压缩阈值（百分比，1–100，默认 50）。
   *
   * 聊天 Session 中，未摘要消息的估算 token 超过模型上下文窗口的该比例时触发压缩。
   * 用 `.default(50)` 使存量 Agent 的 config.json 经 safeParse 自动补默认值（零迁移）。
   */
  compressionThreshold: z.number().int().min(1).max(100).default(50),
  /**
   * 记忆整理（Dream）间隔（分钟，默认 120）。
   *
   * 距离该 Agent 上一次 Dream 达到该间隔、且有未处理 history 时触发整理。
   * 用 `.default(120)` 使存量 Agent 的 config.json 经 safeParse 自动补默认值（零迁移）。
   */
  dreamIntervalMinutes: z.number().int().min(1).default(120),
  voiceId: z.string().optional(),
  voiceLanguage: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/** Agent configuration type */
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Schema for creating/updating an Agent.
 * Omits system-managed fields (id, createdAt, updatedAt) from AgentConfigSchema.
 */
export const AgentConfigInputSchema = AgentConfigSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/** Input type for creating/updating an Agent */
export type AgentConfigInput = z.infer<typeof AgentConfigInputSchema>;

/**
 * Partial schema for PUT (update) requests.
 *
 * 所有字段均为可选，只校验请求体中实际包含的字段。
 * 与 {@link AgentConfigInputSchema}（完整校验，用于 POST 创建）的区别：
 * 创建要求必填字段齐全，更新允许只传需要修改的字段。
 */
export const AgentConfigUpdateSchema = AgentConfigInputSchema.partial();

/** Partial of AgentConfigInput, used for PUT (update) requests. */
export type AgentConfigUpdate = z.infer<typeof AgentConfigUpdateSchema>;
