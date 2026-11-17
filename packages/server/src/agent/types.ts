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

/**
 * system prompt 的分段结构，占用面板分段估算用。
 * core 是系统与人格段，skills 归工具与技能段，不填时消费方按整串处理。
 */
export interface SystemPromptSegments {
  /** 人格基底加 Environment 加叙述说明加常驻记忆板块 */
  core: string;
  /** 逐技能正文全量，拼接顺序与最终 system prompt 一致 */
  skills: string;
}

/**
 * 对账通过的单次模型报数。
 * base 是 input 加 cacheRead 加 cacheWrite 的底数口径，anchorSeq 是报数请求时刻的 Agent 消息数。
 */
export interface UsageReport {
  base: number;
  anchorSeq: number;
}

/** Runtime configuration for AgentCore */
export interface AgentRunConfig {
  agentName: string;
  provider: string;
  modelId: string;
  model: Model<Api>;
  apiKey: string;
  systemPrompt: string;
  /** system prompt 的分段快照，占用分段估算用，可选保证渐进兼容 */
  systemSegments?: SystemPromptSegments;
  workspaceDir: string;
  maxSteps: number;
  tools: Tool[];
  agentId?: string;
  sessionId?: string;
  /** 需要注入 agentId/sessionId 的工具名集合（来自 agentApp MCP Server） */
  agentAppToolNames?: Set<string>;
  /** 步骤间隙取待注入消息的回调，忙时插话由 chat-service 接线 */
  takePendingInputs?: () => PendingInput[];
  /** 模型报回真实 usage 且对账通过时回调，chat-service 落占用底数用 */
  onUsage?: (usage: UsageReport) => void;
}
