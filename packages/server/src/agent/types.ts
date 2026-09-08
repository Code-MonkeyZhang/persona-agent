/**
 * @fileoverview Type definitions for Agent configuration.
 */

import type { Model, Api } from '@earendil-works/pi-ai';
import type { Tool } from '../tools/index.js';
import type { PendingInput } from '@persona/shared';

// 从 shared 再导出，保持 barrel 消费方零改动
export {
  AgentConfigSchema,
  AgentConfigInputSchema,
  AgentConfigUpdateSchema,
  type ModelConfig,
  type AgentConfig,
  type AgentConfigInput,
  type AgentConfigUpdate,
} from '@persona/shared';

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
  agentId?: string;
  sessionId?: string;
  /** 需要注入 agentId/sessionId 的工具名集合（来自 agentApp MCP Server） */
  agentAppToolNames?: Set<string>;
  /** 步骤间隙取待注入消息的回调，忙时插话由 chat-service 接线 */
  takePendingInputs?: () => PendingInput[];
}
