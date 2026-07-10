/**
 * @file renderer/stores/sessionStore.ts
 * @description 会话状态管理 - 负责会话列表获取、切换、创建、删除及消息格式转换
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionMeta, Session } from '../types/session';
import {
  listSessions,
  createSession,
  getSession,
  deleteSession,
  updateSession,
} from '../lib/api';
import type { UIMessage, Thought } from '../types/chat';
import type { Message } from '@persona/shared';
import { deleteScrollPosition } from './scrollPositionCache';

const LAST_SESSION_KEY = 'last-session-id';

/**
 * 移除 thoughts 数组中最后一条 text thought。
 * 最终回答已在主气泡显示，时间线中不再重复出现。
 */
export function stripLastTextThought(thoughts: Thought[]): Thought[] {
  for (let i = thoughts.length - 1; i >= 0; i--) {
    if (thoughts[i].type === 'text') {
      return thoughts.filter((_, idx) => idx !== i);
    }
  }
  return thoughts;
}

interface SessionStore {
  sessions: SessionMeta[];
  currentSession: Session | null;
  currentAgentId: string | null;
  isLoading: boolean;
  error: string | null;
  isNewlyCreated: boolean;

  loadSessions: (agentId: string) => Promise<void>;
  createNewSession: (
    agentId: string,
    title?: string
  ) => Promise<Session | null>;
  switchSession: (agentId: string, id: string) => Promise<Session | null>;
  deleteSessionById: (agentId: string, id: string) => Promise<boolean>;
  updateSessionTitle: (
    agentId: string,
    id: string,
    title: string
  ) => Promise<boolean>;
  updateSessionModel: (
    agentId: string,
    id: string,
    provider: string,
    model: string
  ) => Promise<boolean>;
  updateSessionWorkspace: (
    agentId: string,
    id: string,
    workspacePath: string | undefined
  ) => Promise<boolean>;
  updateCurrentSession: (session: Session) => void;
  updateSessionTitleLocally: (sessionId: string, title: string) => void;
  convertSessionMessages: (messages: Message[]) => UIMessage[];

  /** 按 sessionId 映射的消息预览文本，持久化到 localStorage */
  sessionPreviews: Record<string, string>;
  updateSessionPreview: (sessionId: string, preview: string) => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSession: null,
      currentAgentId: null,
      isLoading: false,
      error: null,
      isNewlyCreated: false,
      sessionPreviews: {},

      /**
       * 加载指定 agent 的所有会话，自动选中上次活跃的会话或第一个会话。
       * @param agentId - Agent ID
       */
      loadSessions: async (agentId: string) => {
        set({ isLoading: true, error: null, currentAgentId: agentId });
        try {
          const sessions = await listSessions(agentId);
          set({ sessions, isLoading: false });

          if (sessions.length > 0) {
            const lastSessionId = localStorage.getItem(LAST_SESSION_KEY);
            const chatSession = sessions.find((s) => s.id.startsWith('chat'));

            let targetId: string;
            if (lastSessionId && sessions.some((s) => s.id === lastSessionId)) {
              targetId = lastSessionId;
            } else if (chatSession) {
              targetId = chatSession.id;
            } else {
              targetId = sessions[0].id;
            }

            const session = await getSession(agentId, targetId);
            set({ currentSession: session });
          } else {
            set({ currentSession: null });
          }
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to load sessions',
            isLoading: false,
          });
        }
      },

      /**
       * 创建新会话并自动切换到该会话。
       * @param agentId - Agent ID
       * @param title - 可选的会话标题
       * @returns 创建的会话对象，失败返回 null
       */
      createNewSession: async (agentId: string, title?: string) => {
        set({ isLoading: true, error: null });
        try {
          const session = await createSession(agentId, title);
          const { sessions } = get();
          localStorage.setItem(LAST_SESSION_KEY, session.id);
          set({
            sessions: [session, ...sessions],
            currentSession: session,
            currentAgentId: agentId,
            isLoading: false,
            isNewlyCreated: true,
          });
          return session;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to create session',
            isLoading: false,
          });
          return null;
        }
      },

      /**
       * 切换到指定会话，从服务器拉取完整数据。
       * @param agentId - Agent ID
       * @param id - 会话 ID
       * @returns 切换后的会话对象，失败返回 null
       */
      switchSession: async (agentId: string, id: string) => {
        set({ isLoading: true, error: null, currentAgentId: agentId });
        try {
          const session = await getSession(agentId, id);
          localStorage.setItem(LAST_SESSION_KEY, id);
          set({ currentSession: session, isLoading: false });
          return session;
        } catch (error) {
          set({
            error:
              error instanceof Error ? error.message : 'Failed to load session',
            isLoading: false,
          });
          return null;
        }
      },

      /**
       * 删除指定会话，若删除的是当前会话则自动切换到下一个。
       * @param agentId - Agent ID
       * @param id - 会话 ID
       * @returns 是否删除成功
       */
      deleteSessionById: async (agentId: string, id: string) => {
        set({ error: null });
        try {
          const success = await deleteSession(agentId, id);
          if (success) {
            deleteScrollPosition(id);
            const { sessions, currentSession } = get();
            const newSessions = sessions.filter((s) => s.id !== id);
            const isCurrentDeleted = currentSession?.id === id;

            if (isCurrentDeleted) {
              if (newSessions.length > 0) {
                const nextSession = await getSession(
                  agentId,
                  newSessions[0].id
                );
                localStorage.setItem(LAST_SESSION_KEY, nextSession.id);
                set({ sessions: newSessions, currentSession: nextSession });
              } else {
                localStorage.removeItem(LAST_SESSION_KEY);
                set({ sessions: newSessions, currentSession: null });
              }
            } else {
              set({ sessions: newSessions });
            }
          }
          return success;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to delete session',
          });
          return false;
        }
      },

      /**
       * 更新指定会话的标题，同步更新服务端和本地状态。
       * @param agentId - Agent ID
       * @param id - 会话 ID
       * @param title - 新标题
       * @returns 是否更新成功
       */
      updateSessionTitle: async (
        agentId: string,
        id: string,
        title: string
      ) => {
        set({ error: null });
        try {
          const session = await updateSession(agentId, id, { title });
          const { sessions, currentSession } = get();
          const newSessions = sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: session.updatedAt } : s
          );
          set({ sessions: newSessions });
          if (currentSession?.id === id) {
            set({ currentSession: session });
          }
          return true;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to update session title',
          });
          return false;
        }
      },

      /**
       * 更新指定会话使用的模型。
       * @param agentId - Agent ID
       * @param id - 会话 ID
       * @param provider - 模型提供商
       * @param model - 模型名称
       * @returns 是否更新成功
       */
      updateSessionModel: async (
        agentId: string,
        id: string,
        provider: string,
        model: string
      ) => {
        set({ error: null });
        try {
          const session = await updateSession(agentId, id, {
            model: { provider, model },
          });
          const { currentSession } = get();
          if (currentSession?.id === id) {
            set({ currentSession: session });
          }
          return true;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to update session model',
          });
          return false;
        }
      },

      /**
       * 更新指定会话的工作区路径。
       * @param agentId - Agent ID
       * @param id - 会话 ID
       * @param workspacePath - 工作区路径
       * @returns 是否更新成功
       */
      updateSessionWorkspace: async (
        agentId: string,
        id: string,
        workspacePath: string | undefined
      ) => {
        set({ error: null });
        try {
          const session = await updateSession(agentId, id, { workspacePath });
          const { currentSession } = get();
          if (currentSession?.id === id) {
            set({ currentSession: session });
          }
          return true;
        } catch (error) {
          set({
            error:
              error instanceof Error
                ? error.message
                : 'Failed to update session workspace',
          });
          return false;
        }
      },

      /**
       * 直接替换当前会话对象，同时更新会话列表中的对应项。
       * @param session - 新的会话对象
       */
      updateCurrentSession: (session: Session) => {
        set({ currentSession: session });
        const { sessions } = get();
        const index = sessions.findIndex((s) => s.id === session.id);
        if (index >= 0) {
          const newSessions = [...sessions];
          newSessions[index] = session;
          set({ sessions: newSessions });
        }
      },

      /**
       * 仅在本地更新会话标题，不调用服务端接口。用于接收 title_updated WebSocket 事件时更新 UI。
       * @param sessionId - 会话 ID
       * @param title - 新标题
       */
      updateSessionTitleLocally: (sessionId: string, title: string) => {
        const { sessions, currentSession } = get();
        const newSessions = sessions.map((s) =>
          s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
        );
        set({ sessions: newSessions });
        if (currentSession?.id === sessionId) {
          set({
            currentSession: { ...currentSession, title, updatedAt: Date.now() },
          });
        }
      },

      /**
       * 将服务端返回的 Message 数组转换为客户端 UIMessage 格式。
       * 连续的 assistant 消息按轮次分组合并为一条 UIMessage：
       * - thoughts 全部拼接，保留原始顺序
       * - 每步的 content 作为 text thought 进入时间线
       * - 最终回答的 content 取最后一条非空值，同时从 thoughts 移除避免重复
       * - user / error 消息作为天然分隔点打断分组
       * - system 消息直接跳过
       * @param messages - 服务端返回的原始消息数组
       * @returns 转换后的客户端 UIMessage 数组
       */
      convertSessionMessages: (messages: Message[]): UIMessage[] => {
        const result: UIMessage[] = [];
        let pendingThoughts: Thought[] = [];
        let pendingContent = '';
        let pendingStartIndex = -1;

        /** 将缓冲区中的 assistant 消息合并为一条 UIMessage 产出 */
        const flushPending = () => {
          if (pendingStartIndex === -1) return;
          const finalThoughts = stripLastTextThought(pendingThoughts);
          result.push({
            id: `session-msg-${pendingStartIndex}`,
            type: 'assistant',
            content: pendingContent,
            timestamp: new Date(),
            thoughts: finalThoughts.length > 0 ? finalThoughts : undefined,
          });
          pendingThoughts = [];
          pendingContent = '';
          pendingStartIndex = -1;
        };

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];

          if (msg.role === 'system') {
            continue;
          }

          if (msg.role === 'assistant') {
            if (pendingStartIndex === -1) pendingStartIndex = i;

            if (msg.thinking) {
              pendingThoughts.push({
                id: `thought-${i}-thinking`,
                type: 'thinking',
                timestamp: new Date(),
                content: msg.thinking,
              });
            }

            if (msg.tool_calls && msg.tool_calls.length > 0) {
              msg.tool_calls.forEach((tc, tcIndex) => {
                pendingThoughts.push({
                  id: `thought-${i}-tool-${tcIndex}`,
                  type: 'tool_use',
                  timestamp: new Date(),
                  toolName: tc.function.name,
                  toolInput: tc.function.arguments,
                  toolResult: tc.toolResult
                    ? {
                        output: tc.toolResult.content,
                        isError: tc.toolResult.isError,
                      }
                    : undefined,
                });
              });
            }

            if (msg.content) {
              pendingContent = msg.content;
              pendingThoughts.push({
                id: `thought-${i}-text`,
                type: 'text',
                timestamp: new Date(),
                content: msg.content,
              });
            }
          } else {
            flushPending();

            result.push({
              id: `session-msg-${i}`,
              type: msg.role === 'user' ? 'user' : 'error',
              content: typeof msg.content === 'string' ? msg.content : '',
              timestamp: new Date(),
            });
          }
        }
        flushPending();

        return result;
      },

      /**
       * 更新指定会话的消息预览，同步写入 localStorage 以便重启后保留。
       * @param sessionId - 会话 ID
       * @param preview - 预览文本
       */
      updateSessionPreview: (sessionId: string, preview: string) => {
        set((state) => ({
          sessionPreviews: { ...state.sessionPreviews, [sessionId]: preview },
        }));
      },
    }),
    {
      name: 'session-store',
      partialize: (s) => ({ sessionPreviews: s.sessionPreviews }),
    }
  )
);
