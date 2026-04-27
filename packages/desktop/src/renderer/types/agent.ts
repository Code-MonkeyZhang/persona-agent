/**
 * @file src/renderer/types/agent.ts
 * @description Agent 相关类型定义，包含 Agent 实体、创建/更新输入及 API 响应类型
 */

export interface Agent {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  defaultModel: {
    provider: string;
    model: string;
  };
  maxSteps: number;
  mcpNames: string[];
  skillNames: string[];
  defaultWorkspacePath?: string;
  voiceId?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type CreateAgentInput = Omit<Agent, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type UpdateAgentInput = Partial<
  Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>
>;

export interface ListAgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  agent: Agent;
}
