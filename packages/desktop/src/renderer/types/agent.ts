/**
 * @file src/renderer/types/agent.ts
 * @description Agent 相关类型再导出。类型定义已迁移至 @persona/shared，此处保留别名以兼容下游。
 */

export type {
  AgentConfig as Agent,
  AgentConfigInput as CreateAgentInput,
  AgentConfigUpdate as UpdateAgentInput,
} from '@persona/shared';
