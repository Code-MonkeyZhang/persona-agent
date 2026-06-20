/**
 * @fileoverview Type definitions for Agent configuration.
 */

import { z } from 'zod';
import type { Model, Api } from '@earendil-works/pi-ai';
import type { Tool } from '../tools/index.js';

/** Model configuration schema */
export const ModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

/** Model configuration type */
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

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

/** Runtime configuration for AgentCore */
export interface AgentRunConfig {
  agentName: string;
  provider: string;
  modelId: string;
  model: Model<Api>;
  apiKey: string;
  systemPrompt: string;
  workspaceDir: string;
  maxSteps: number;
  tools: Tool[];
}
