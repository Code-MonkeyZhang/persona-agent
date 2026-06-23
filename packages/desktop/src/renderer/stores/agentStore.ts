/**
 * @file stores/agentStore.ts
 * @description Agent 状态管理，维护 Agent 列表与当前选中 Agent，所有增删改操作先调后端 API 再更新本地缓存
 */

import { create } from 'zustand';
import type {
  AgentConfig,
  AgentConfigInput,
  AgentConfigUpdate,
} from '../types/agent';
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
} from '../lib/api';
import { logger } from '../lib/logger';

const LAST_AGENT_KEY = 'last-agent-id';
interface AgentStore {
  agents: AgentConfig[];
  currentAgent: AgentConfig | null;
  isLoading: boolean;
  error: string | null;
  agentAvatarPreviews: Record<string, string>;

  loadAgents: () => Promise<void>;
  switchAgent: (id: string) => Promise<AgentConfig | null>;
  createNewAgent: (input: AgentConfigInput) => Promise<AgentConfig | null>;
  updateAgentById: (
    id: string,
    input: AgentConfigUpdate
  ) => Promise<AgentConfig | null>;
  deleteAgentById: (id: string) => Promise<boolean>;
  setAvatarPreview: (id: string, base64: string) => void;
  removeAvatarPreview: (id: string) => void;
  updateAgentMcpNames: (agentId: string, mcpNames: string[]) => Promise<void>;
  updateAgentSkillNames: (
    agentId: string,
    skillNames: string[]
  ) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  currentAgent: null,
  isLoading: false,
  error: null,
  agentAvatarPreviews: {},

  loadAgents: async () => {
    set({ isLoading: true, error: null });
    try {
      logger.info('[AgentStore] loadAgents started');
      const agents = await listAgents();
      logger.info(
        `[AgentStore] listAgents returned ${agents.length} agents:`,
        JSON.stringify(
          agents.map((a) => ({ id: a.id, name: a.name })),
          null,
          2
        )
      );
      set({ agents, isLoading: false });

      if (agents.length > 0) {
        const lastAgentId = localStorage.getItem(LAST_AGENT_KEY);
        const targetId =
          lastAgentId && agents.some((a) => a.id === lastAgentId)
            ? lastAgentId
            : agents[0].id;

        logger.info(
          `[AgentStore] Fetching current agent, lastAgentId=${lastAgentId}, targetId=${targetId}`
        );
        const agent = await getAgent(targetId);
        set({ currentAgent: agent });
      } else {
        logger.warn('[AgentStore] No agents found from server');
      }
    } catch (error) {
      logger.error(
        '[AgentStore] loadAgents failed:',
        error instanceof Error ? error.stack : error
      );
      set({
        error: error instanceof Error ? error.message : 'Failed to load agents',
        isLoading: false,
      });
    }
  },

  switchAgent: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const agent = await getAgent(id);
      localStorage.setItem(LAST_AGENT_KEY, id);
      set({ currentAgent: agent, isLoading: false });
      return agent;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to switch agent',
        isLoading: false,
      });
      return null;
    }
  },

  createNewAgent: async (input: AgentConfigInput) => {
    set({ isLoading: true, error: null });
    try {
      const agent = await createAgent(input);
      const { agents } = get();
      localStorage.setItem(LAST_AGENT_KEY, agent.id);
      set({
        agents: [...agents, agent],
        currentAgent: agent,
        isLoading: false,
      });
      return agent;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to create agent',
        isLoading: false,
      });
      return null;
    }
  },

  updateAgentById: async (id: string, input: AgentConfigUpdate) => {
    set({ error: null });
    try {
      const agent = await updateAgent(id, input);
      const { agents, currentAgent } = get();
      const newAgents = agents.map((a) => (a.id === id ? agent : a));
      set({ agents: newAgents });

      if (currentAgent?.id === id) {
        set({ currentAgent: agent });
      }
      return agent;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to update agent',
      });
      return null;
    }
  },

  deleteAgentById: async (id: string) => {
    set({ error: null });
    try {
      const success = await deleteAgent(id);
      if (success) {
        const { agents, currentAgent } = get();
        const newAgents = agents.filter((a) => a.id !== id);
        const isCurrentDeleted = currentAgent?.id === id;

        if (isCurrentDeleted) {
          if (newAgents.length > 0) {
            const nextAgent = await getAgent(newAgents[0].id);
            localStorage.setItem(LAST_AGENT_KEY, nextAgent.id);
            set({ agents: newAgents, currentAgent: nextAgent });
          } else {
            localStorage.removeItem(LAST_AGENT_KEY);
            set({ agents: newAgents, currentAgent: null });
          }
        } else {
          set({ agents: newAgents });
        }
      }
      return success;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : 'Failed to delete agent',
      });
      return false;
    }
  },

  setAvatarPreview: (id: string, base64: string) => {
    const { agentAvatarPreviews } = get();
    set({ agentAvatarPreviews: { ...agentAvatarPreviews, [id]: base64 } });
  },

  removeAvatarPreview: (id: string) => {
    const { agentAvatarPreviews } = get();
    const { [id]: _, ...rest } = agentAvatarPreviews;
    set({ agentAvatarPreviews: rest });
  },

  /** 仅更新 Agent 的 MCP 工具分配（供工具视图保存按钮调用） */
  updateAgentMcpNames: async (agentId: string, mcpNames: string[]) => {
    await get().updateAgentById(agentId, { mcpNames });
  },

  /** 仅更新 Agent 的 Skill 分配（供技能视图保存按钮调用） */
  updateAgentSkillNames: async (agentId: string, skillNames: string[]) => {
    await get().updateAgentById(agentId, { skillNames });
  },
}));
