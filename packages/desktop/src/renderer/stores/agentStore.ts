/**
 * @file stores/agentStore.ts
 * @description Agent 状态管理，维护 Agent 列表与当前选中 Agent，所有增删改操作先调后端 API 再更新本地缓存
 */

import { create } from 'zustand';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../types/agent';
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
} from '../lib/api';
import { logger } from '../lib/logger';

const LAST_AGENT_KEY = 'nano-agent-last-agent-id';
interface AgentStore {
  agents: Agent[];
  currentAgent: Agent | null;
  isLoading: boolean;
  error: string | null;

  /**
   * 从后端加载完整Agent列表并缓存到本地。
   * 同时从localStorage恢复上次选中的Agent，如果不存在则默认选中第一个。
   */
  loadAgents: () => Promise<void>;

  /**
   * 切换当前Agent到指定id，选择结果会持久化到localStorage。
   * @param id - 要切换到的Agent id
   * @returns 切换后的Agent对象，失败时返回null
   */
  switchAgent: (id: string) => Promise<Agent | null>;

  /**
   * 创建新Agent并添加到本地缓存，同时自动选中新创建的Agent。
   * @param input - 新Agent的数据
   * @returns 创建的Agent对象，失败时返回null
   */
  createNewAgent: (input: CreateAgentInput) => Promise<Agent | null>;

  /**
   * 更新指定Agent，同步更新本地缓存。如果更新的是当前Agent，也会刷新currentAgent。
   * @param id - 要更新的Agent id
   * @param input - 要更新的字段
   * @returns 更新后的Agent对象，失败时返回null
   */
  updateAgentById: (
    id: string,
    input: UpdateAgentInput
  ) => Promise<Agent | null>;

  /**
   * 删除指定Agent并从本地缓存移除。如果删除的是当前Agent，自动切换到第一个剩余Agent；没有剩余时currentAgent设为null。
   * @param id - 要删除的Agent id
   * @returns 删除成功返回true，失败返回false
   */
  deleteAgentById: (id: string) => Promise<boolean>;

  /**
   * 直接设置当前Agent，不调用后端。适用于数据已就绪时直接更新状态。
   * @param agent - 要设为当前的Agent
   */
  setCurrentAgent: (agent: Agent) => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  currentAgent: null,
  isLoading: false,
  error: null,

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

  createNewAgent: async (input: CreateAgentInput) => {
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

  updateAgentById: async (id: string, input: UpdateAgentInput) => {
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

  setCurrentAgent: (agent: Agent) => {
    set({ currentAgent: agent });
  },
}));
