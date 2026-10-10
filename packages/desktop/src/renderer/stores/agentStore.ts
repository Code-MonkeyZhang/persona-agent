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
import { appStorage } from '../lib/appStorage';
import { toast } from './toastStore';
import i18n from '../i18n';

const LAST_AGENT_KEY = 'last-agent-id';
interface AgentStore {
  agents: AgentConfig[];
  currentAgent: AgentConfig | null;
  agentAvatarPreviews: Record<string, string>;

  loadAgents: () => Promise<void>;
  switchAgent: (id: string) => Promise<AgentConfig | null>;
  createNewAgent: (input: AgentConfigInput) => Promise<AgentConfig | null>;
  updateAgentById: (
    id: string,
    input: AgentConfigUpdate
  ) => Promise<AgentConfig>;
  /** 重取单个 agent 补正 store 身份，头像上传后调用 */
  refreshAgentById: (id: string) => Promise<void>;
  deleteAgentById: (id: string) => Promise<boolean>;
  setAvatarPreview: (id: string, base64: string) => void;
  removeAvatarPreview: (id: string) => void;
  assignSkill: (agentId: string, skillName: string) => Promise<void>;
  unassignSkill: (agentId: string, skillName: string) => Promise<void>;
  /** 给 Agent 追加一个 MCP 服务，已分配过则跳过，失败时 toast 提示 */
  assignMcp: (agentId: string, mcpName: string) => Promise<void>;
  /** 从 Agent 移除一个 MCP 服务，未分配则跳过，失败时 toast 提示 */
  unassignMcp: (agentId: string, mcpName: string) => Promise<void>;
  updateAgentSkillNames: (
    agentId: string,
    skillNames: string[]
  ) => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  agents: [],
  currentAgent: null,
  agentAvatarPreviews: {},

  loadAgents: async () => {
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
      set({ agents });
      // 角色列表进缓存，离线回退用
      void window.api?.cache.putAgents(agents);

      if (agents.length > 0) {
        const lastAgentId = appStorage.getItem(LAST_AGENT_KEY);
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
      // 离线回退：HTTP 失败时读缓存里的角色列表
      try {
        const cached = (await window.api?.cache.getAgents()) ?? [];
        if (cached.length > 0) {
          logger.info(
            `[AgentStore] Falling back to ${cached.length} cached agents`
          );
          const lastAgentId = localStorage.getItem(LAST_AGENT_KEY);
          const target = cached.find((a) => a.id === lastAgentId) ?? cached[0];
          set({ agents: cached, currentAgent: target });
        }
      } catch {
        // 缓存也不可用时保持现状
      }
    }
  },

  switchAgent: async (id: string) => {
    try {
      const agent = await getAgent(id);
      appStorage.setItem(LAST_AGENT_KEY, id);
      set({ currentAgent: agent });
      return agent;
    } catch {
      return null;
    }
  },

  createNewAgent: async (input: AgentConfigInput) => {
    try {
      const agent = await createAgent(input);
      const { agents } = get();
      appStorage.setItem(LAST_AGENT_KEY, agent.id);
      set({ agents: [...agents, agent], currentAgent: agent });
      return agent;
    } catch {
      return null;
    }
  },

  updateAgentById: async (id: string, input: AgentConfigUpdate) => {
    const agent = await updateAgent(id, input);
    const { agents, currentAgent } = get();
    const newAgents = agents.map((a) => (a.id === id ? agent : a));
    set({ agents: newAgents });

    if (currentAgent?.id === id) {
      set({ currentAgent: agent });
    }
    return agent;
  },

  /**
   * 重取单个 agent 并同步进列表与 currentAgent。
   * 新建角色上传头像后 POST 响应里的 avatarHash 已过期，靠这里补正身份。
   */
  refreshAgentById: async (id: string) => {
    try {
      const agent = await getAgent(id);
      const { agents, currentAgent } = get();
      set({
        agents: agents.map((a) => (a.id === id ? agent : a)),
        currentAgent: currentAgent?.id === id ? agent : currentAgent,
      });
    } catch (error) {
      logger.error(`[AgentStore] refreshAgentById failed for ${id}:`, error);
    }
  },

  deleteAgentById: async (id: string) => {
    try {
      const success = await deleteAgent(id);
      if (success) {
        // 角色删除不在变更流范围，缓存行显式清理
        void window.api?.cache.deleteAgent(id);
        const { agents, currentAgent } = get();
        const newAgents = agents.filter((a) => a.id !== id);
        const isCurrentDeleted = currentAgent?.id === id;

        if (isCurrentDeleted) {
          if (newAgents.length > 0) {
            const nextAgent = await getAgent(newAgents[0].id);
            appStorage.setItem(LAST_AGENT_KEY, nextAgent.id);
            set({ agents: newAgents, currentAgent: nextAgent });
          } else {
            appStorage.removeItem(LAST_AGENT_KEY);
            set({ agents: newAgents, currentAgent: null });
          }
        } else {
          set({ agents: newAgents });
        }
      }
      return success;
    } catch {
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

  /** 给 Agent 追加一个 MCP 服务，已分配过则跳过，失败时 toast 提示 */
  assignMcp: async (agentId, mcpName) => {
    const agent = get().agents.find((a) => a.id === agentId);
    if (!agent || agent.mcpNames.includes(mcpName)) return;
    try {
      await get().updateAgentById(agentId, {
        mcpNames: [...agent.mcpNames, mcpName],
      });
      logger.info(`[AgentStore] Assigned MCP ${mcpName} to agent ${agentId}`);
    } catch (err) {
      logger.error(`[AgentStore] Failed to assign MCP ${mcpName}:`, err);
      toast.error(i18n.t('tools.assignFailed'));
    }
  },

  /** 从 Agent 移除一个 MCP 服务，未分配则跳过，失败时 toast 提示 */
  unassignMcp: async (agentId, mcpName) => {
    const agent = get().agents.find((a) => a.id === agentId);
    if (!agent || !agent.mcpNames.includes(mcpName)) return;
    try {
      await get().updateAgentById(agentId, {
        mcpNames: agent.mcpNames.filter((n) => n !== mcpName),
      });
      logger.info(
        `[AgentStore] Unassigned MCP ${mcpName} from agent ${agentId}`
      );
    } catch (err) {
      logger.error(`[AgentStore] Failed to unassign MCP ${mcpName}:`, err);
      toast.error(i18n.t('tools.assignFailed'));
    }
  },

  /** 仅更新 Agent 的 Skill 分配 */
  updateAgentSkillNames: async (agentId: string, skillNames: string[]) => {
    await get().updateAgentById(agentId, { skillNames });
  },

  /** 给 Agent 追加一个技能，已分配过则跳过，失败时 toast 提示 */
  assignSkill: async (agentId: string, skillName: string) => {
    const agent = get().agents.find((a) => a.id === agentId);
    if (!agent || agent.skillNames.includes(skillName)) return;
    try {
      await get().updateAgentSkillNames(agentId, [
        ...agent.skillNames,
        skillName,
      ]);
      logger.info(
        `[AgentStore] Assigned skill ${skillName} to agent ${agentId}`
      );
    } catch (err) {
      logger.error(`[AgentStore] Failed to assign skill ${skillName}:`, err);
      toast.error(i18n.t('skills.assignFailed'));
    }
  },

  /** 从 Agent 移除一个技能，未分配则跳过，失败时 toast 提示 */
  unassignSkill: async (agentId: string, skillName: string) => {
    const agent = get().agents.find((a) => a.id === agentId);
    if (!agent || !agent.skillNames.includes(skillName)) return;
    try {
      await get().updateAgentSkillNames(
        agentId,
        agent.skillNames.filter((n) => n !== skillName)
      );
      logger.info(
        `[AgentStore] Unassigned skill ${skillName} from agent ${agentId}`
      );
    } catch (err) {
      logger.error(`[AgentStore] Failed to unassign skill ${skillName}:`, err);
      toast.error(i18n.t('skills.assignFailed'));
    }
  },
}));
