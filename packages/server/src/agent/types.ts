/**
 * @fileoverview Type definitions for Agent configuration.
 */

import type { Model, Api } from '@earendil-works/pi-ai';
import type { Tool } from '../tools/index.js';

// 从 shared 再导出，保持 barrel 消费方零改动（agent/index.ts → 此处 → shared）
export {
  ModelConfigSchema,
  AgentConfigSchema,
  AgentConfigInputSchema,
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
}
