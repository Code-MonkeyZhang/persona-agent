/**
 * @file renderer/stores/chatStore.ts
 * @description 聊天状态管理 - 负责消息发送、WebSocket 消息接收分发与聊天状态维护
 *
 * 采用 per-session state map 隔离不同 session 的消息和加载状态，
 * 切换 session 时只更新 currentSessionId 指针，不再替换整个消息数组。
 */

import { create } from 'zustand';
import type { UIMessage, ConnectionStatus, Thought } from '../types/chat';
import type { ServerMessage, StepCompleteMessage } from '@persona/shared';
import { buildPreviewText } from '@persona/shared';
import {
  createMessage,
  sendChatMessage,
  getSession,
  WebSocketClient,
} from '../lib/api';
import { toast } from './toastStore';
import { logger } from '../lib/logger';
import { useSessionStore, stripLastTextThought } from './sessionStore';
import { useCompanionStore } from './companionStore';
import { useVoiceStore } from './voiceStore';

/**
 * 将 step_complete 消息中的思考过程和工具调用转换为 Thought 数组。
 * 每步的 content 作为 text thought 保留在时间线，最终回答会在 complete 时移除。
 * @param msg - 服务端推送的步骤完成消息
 * @returns 转换后的 Thought 数组
 */
function cycleToThoughts(msg: StepCompleteMessage): Thought[] {
  const thoughts: Thought[] = [];

  // Add thinking
  if (msg.thinking) {
    thoughts.push({
      id: crypto.randomUUID(),
      type: 'thinking',
      timestamp: new Date(),
      content: msg.thinking,
    });
  }

  // Add intermediate text content
  if (msg.content) {
    thoughts.push({
      id: crypto.randomUUID(),
      type: 'text',
      timestamp: new Date(),
      content: msg.content,
    });
  }

  // Add tool_use with results
  msg.toolCalls?.forEach((tc) => {
    const result = msg.toolResults?.find((r) => r.toolCallId === tc.id);
    thoughts.push({
      id: tc.id,
      type: 'tool_use',
      timestamp: new Date(),
      toolName: tc.name,
      toolInput: tc.arguments,
      toolResult: result
        ? {
            output: result.result,
            isError: !result.success,
          }
        : undefined,
    });
  });

  return thoughts;
}

/**
 * 清理空占位气泡：如果 streamingMessageId 指向的消息无内容无 thoughts 则从列表移除。
 * 用于请求失败或出错时回滚乐观创建的空 assistant 气泡。
 * @param messages - 当前消息列表
 * @param streamingMessageId - 当前流式消息 ID
 * @returns 移除空占位后的消息列表
 */
function filterEmptyPlaceholder(
  messages: UIMessage[],
  streamingMessageId: string | null
): UIMessage[] {
  if (!streamingMessageId) return messages;
  const placeholder = messages.find((m) => m.id === streamingMessageId);
  if (
    placeholder &&
    !placeholder.content.trim() &&
    !(placeholder.thoughts && placeholder.thoughts.length > 0)
  ) {
    return messages.filter((m) => m.id !== streamingMessageId);
  }
  return messages;
}

/**
 * 为一个 session 追加空的 AI 占位气泡并切到生成态。
 * 用于用户发消息（乐观占位）以及 App 通知/恢复订阅触发的外部回合——
 * 只有占位气泡存在，后续 step_complete 才能正确填入而非被当迟到消息丢弃。
 */
function withLoadingPlaceholder(
  sessionState: SessionChatState
): SessionChatState {
  const placeholderId = crypto.randomUUID();
  return {
    ...sessionState,
    messages: [
      ...sessionState.messages,
      {
        id: placeholderId,
        type: 'assistant' as const,
        content: '',
        timestamp: new Date(),
        thoughts: [],
      },
    ],
    isLoading: true,
    streamingMessageId: placeholderId,
  };
}

/** 单个 session 的聊天状态 */
interface SessionChatState {
  messages: UIMessage[];
  isLoading: boolean;
  /** 当前轮次正在积累的 assistant 消息 ID，null 表示无活跃流式消息 */
  streamingMessageId: string | null;
}

interface ChatStore {
  /** 按 sessionId 隔离的各 session 聊天状态 */
  sessionStates: Map<string, SessionChatState>;
  /** 当前用户正在查看的 session ID */
  currentSessionId: string | null;
  connectionStatus: ConnectionStatus;
  agentId: string | null;
  lastUserMessage: string | null;
  wsClient: WebSocketClient | null;

  setCurrentSessionId: (id: string | null) => void;
  /** 为指定 session 初始化聊天状态 */
  initSessionState: (sessionId: string, messages: UIMessage[]) => void;
  /** 清除指定 session 的聊天状态 */
  clearSessionState: (sessionId: string) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  /** 请求服务端中止当前会话的生成 */
  abortGeneration: (sessionId?: string) => void;
  /** 进入 session 时订阅事件流，供 App.tsx 在 session 切换时调用 */
  subscribeSession: (sessionId: string) => void;
  handleWsMessage: (msg: ServerMessage) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAgentId: (id: string | null) => void;
  setWsClient: (client: WebSocketClient | null) => void;
}

export const useChatStore = create<ChatStore>((set, get) => {
  /**
   * 从磁盘重新拉取指定 session 的消息列表。
   * 用于 isGenerating 恢复场景：complete 事件到达时本地没有流式内容，
   * 需要从后端获取最终落盘的完整消息。
   */
  async function refreshSessionMessages(sessionId: string): Promise<void> {
    const agentId = get().agentId;
    if (!agentId) {
      logger.warn('Cannot refresh: no agentId', { sessionId });
      return;
    }
    try {
      const session = await getSession(agentId, sessionId);
      const converted = useSessionStore
        .getState()
        .convertSessionMessages(session.messages);
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const ss = newStates.get(sessionId);
        if (ss) {
          newStates.set(sessionId, { ...ss, messages: converted });
        }
        return { sessionStates: newStates };
      });
      logger.info('Session messages refreshed from disk', { sessionId });
    } catch (err) {
      logger.error('Failed to refresh session messages', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    sessionStates: new Map(),
    currentSessionId: null,
    connectionStatus: 'disconnected',
    agentId: null,
    lastUserMessage: null,
    wsClient: null,

    setConnectionStatus: (status: ConnectionStatus) => {
      set({ connectionStatus: status });
    },

    setCurrentSessionId: (id: string | null) => {
      set({ currentSessionId: id });
    },

    initSessionState: (sessionId: string, messages: UIMessage[]) => {
      set((state) => {
        const newStates = new Map(state.sessionStates);
        newStates.set(sessionId, {
          messages,
          isLoading: false,
          streamingMessageId: null,
        });
        return { sessionStates: newStates };
      });
    },

    clearSessionState: (sessionId: string) => {
      set((state) => {
        const newStates = new Map(state.sessionStates);
        newStates.delete(sessionId);
        return { sessionStates: newStates };
      });
    },

    setAgentId: (id: string | null) => {
      set({ agentId: id });
    },

    setWsClient: (client: WebSocketClient | null) => {
      set({ wsClient: client });
    },

    sendMessage: async (content: string, explicitSessionId?: string) => {
      const state = get();
      const sessionId = explicitSessionId || state.currentSessionId;
      const agentId = state.agentId;
      const { connectionStatus, wsClient } = state;

      if (!agentId || !sessionId) {
        toast.error('No agent or session selected');
        return;
      }

      if (connectionStatus !== 'connected') {
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId) || {
            messages: [],
            isLoading: false,
            streamingMessageId: null,
          };
          newStates.set(sessionId, {
            messages: [
              ...sessionState.messages,
              createMessage('user', content),
              createMessage(
                'error',
                'Cannot connect to server. Please ensure Agent Server is running.'
              ),
            ],
            isLoading: false,
            streamingMessageId: null,
          });
          return { sessionStates: newStates };
        });
        toast.error('Cannot connect to server');
        return;
      }

      // 乐观追加用户消息 + 空 assistant 占位气泡，立即显示打字动画
      const placeholderId = crypto.randomUUID();
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const sessionState = newStates.get(sessionId) || {
          messages: [],
          isLoading: false,
          streamingMessageId: null,
        };
        newStates.set(sessionId, {
          messages: [
            ...sessionState.messages,
            createMessage('user', content),
            {
              id: placeholderId,
              type: 'assistant' as const,
              content: '',
              timestamp: new Date(),
              thoughts: [],
            },
          ],
          isLoading: true,
          streamingMessageId: placeholderId,
        });
        return { sessionStates: newStates, lastUserMessage: content };
      });
      logger.info('Optimistic placeholder created', {
        sessionId,
        placeholderId,
      });

      // 同步更新会话预览
      useSessionStore
        .getState()
        .updateSessionPreview(sessionId, buildPreviewText(content));

      wsClient?.subscribe(sessionId);

      try {
        const voiceEnabled = useVoiceStore.getState().voiceEnabled;
        const result = await sendChatMessage(
          agentId,
          sessionId,
          content,
          voiceEnabled
        );
        if (!result.success) {
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              newStates.set(sessionId, {
                ...sessionState,
                messages: filterEmptyPlaceholder(
                  sessionState.messages,
                  sessionState.streamingMessageId
                ),
                isLoading: false,
                streamingMessageId: null,
              });
            }
            return { sessionStates: newStates };
          });
        }
      } catch {
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId);
          if (sessionState) {
            newStates.set(sessionId, {
              ...sessionState,
              messages: filterEmptyPlaceholder(
                sessionState.messages,
                sessionState.streamingMessageId
              ),
              isLoading: false,
              streamingMessageId: null,
            });
          }
          return { sessionStates: newStates };
        });
      }
    },

    abortGeneration: (explicitSessionId?: string) => {
      const sessionId = explicitSessionId || get().currentSessionId;
      if (!sessionId) return;
      get().wsClient?.abort(sessionId);
      logger.info('Abort requested', { sessionId });
    },

    subscribeSession: (sessionId: string) => {
      get().wsClient?.subscribe(sessionId);
    },

    /**
     * 处理 WebSocket 推送消息，按 sessionId 路由到对应 session 的状态。
     * 所有 session 作用域事件均通过 msg.sessionId 定位 Map entry。
     */
    handleWsMessage: (msg: ServerMessage) => {
      switch (msg.type) {
        case 'subscribed': {
          const sessionId = msg.sessionId;
          if (msg.isGenerating) {
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const sessionState = newStates.get(sessionId);
              // 只增不减：仅在当前未加载时恢复，避免与 sendMessage 乐观占位冲突
              if (sessionState && !sessionState.isLoading) {
                newStates.set(sessionId, withLoadingPlaceholder(sessionState));
              }
              return { sessionStates: newStates };
            });
            logger.info('Session is generating, restored loading state', {
              sessionId,
            });
          } else {
            logger.info('Subscribed to session:', sessionId);
          }
          break;
        }

        case 'app_notification': {
          // 外部（App）触发的回合：与用户发消息一样放占位气泡并切生成态，
          // 这样紧随其后的 step_complete 能正确填入，而非被 isLoading 守卫丢弃
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState && !sessionState.isLoading) {
              newStates.set(sessionId, withLoadingPlaceholder(sessionState));
            }
            return { sessionStates: newStates };
          });
          logger.info('App notification received', {
            sessionId,
            source: msg.source,
          });
          break;
        }

        case 'step_complete': {
          const sessionId = msg.sessionId;
          const newThoughts = cycleToThoughts(msg);

          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              if (tc.name === 'show_pose' && tc.arguments) {
                const pose = tc.arguments.pose as string;
                const result = msg.toolResults?.find(
                  (tr) => tr.toolCallId === tc.id
                );
                if (pose && result?.success) {
                  useCompanionStore.getState().setPose(pose, true);
                }
              }
            }
          }

          // 在 set 回调外读取当前 sessionState，避免在回调内调用 get()
          const currentSnap = get();
          const sessionState = currentSnap.sessionStates.get(sessionId);
          if (sessionState) {
            // 防御：本回合已结束后迟到的 step_complete 直接丢弃，
            // 避免 streamingMessageId 被清成 null 后走首步分支创建孤立气泡
            if (!sessionState.isLoading) {
              logger.info('Late step_complete ignored', { sessionId });
              break;
            }

            const streamingId = sessionState.streamingMessageId;

            if (streamingId) {
              // 后续步骤：追加 thoughts 到已有的流式消息，content 仅在非空时覆盖
              set((state) => {
                const newStates = new Map(state.sessionStates);
                newStates.set(sessionId, {
                  ...sessionState,
                  messages: sessionState.messages.map((m) =>
                    m.id === streamingId
                      ? {
                          ...m,
                          thoughts: [...(m.thoughts || []), ...newThoughts],
                          content: msg.content || m.content,
                        }
                      : m
                  ),
                });
                return { sessionStates: newStates };
              });
            } else {
              // 首步：创建新消息并记下 streamingMessageId
              const newId = crypto.randomUUID();
              set((state) => {
                const newStates = new Map(state.sessionStates);
                newStates.set(sessionId, {
                  ...sessionState,
                  streamingMessageId: newId,
                  messages: [
                    ...sessionState.messages,
                    {
                      id: newId,
                      type: 'assistant' as const,
                      content: msg.content || '',
                      timestamp: new Date(),
                      thoughts: newThoughts,
                    },
                  ],
                });
                return { sessionStates: newStates };
              });
            }

            // 同步更新会话预览
            useSessionStore
              .getState()
              .updateSessionPreview(
                sessionId,
                buildPreviewText(msg.content || '')
              );
          }
          break;
        }

        case 'complete': {
          const sessionId = msg.sessionId;
          const snap = get();
          const sessionState = snap.sessionStates.get(sessionId);
          const streamingId = sessionState?.streamingMessageId ?? null;
          const streamingMsg = streamingId
            ? sessionState?.messages.find((m) => m.id === streamingId)
            : null;
          // 无流式消息或流式消息为空占位时，需要从磁盘刷新
          const needsRefresh =
            !streamingMsg ||
            (!streamingMsg.content.trim() &&
              !(streamingMsg.thoughts && streamingMsg.thoughts.length > 0));

          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (ss) {
              let messages = ss.messages;
              if (streamingId) {
                const filtered = filterEmptyPlaceholder(
                  ss.messages,
                  streamingId
                );
                if (filtered !== ss.messages) {
                  messages = filtered;
                } else {
                  messages = ss.messages.map((m) =>
                    m.id === streamingId
                      ? {
                          ...m,
                          thoughts: stripLastTextThought(m.thoughts || []),
                        }
                      : m
                  );
                }
              }
              newStates.set(sessionId, {
                ...ss,
                messages,
                isLoading: false,
                streamingMessageId: null,
              });
            }
            return { sessionStates: newStates };
          });

          if (needsRefresh) {
            logger.info('Turn complete, refreshing from disk', { sessionId });
            void refreshSessionMessages(sessionId);
          } else {
            logger.info('Turn complete, stripped last text thought', {
              sessionId,
            });
          }
          break;
        }

        case 'speak_ready': {
          if (msg.sessionId !== get().currentSessionId) break;
          const { voiceEnabled, speak } = useVoiceStore.getState();
          if (voiceEnabled) {
            void speak(
              msg.speakText,
              msg.voiceId,
              msg.apiKey,
              msg.model,
              msg.languageBoost
            );
          }
          break;
        }

        case 'speak_error': {
          toast.warning(msg.message);
          break;
        }

        case 'error': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              newStates.set(sessionId, {
                ...sessionState,
                messages: [
                  ...filterEmptyPlaceholder(
                    sessionState.messages,
                    sessionState.streamingMessageId
                  ),
                  createMessage('error', msg.message),
                ],
                isLoading: false,
                streamingMessageId: null,
              });
            }
            return { sessionStates: newStates };
          });
          break;
        }

        case 'aborted': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              const streamingId = sessionState.streamingMessageId;
              // 先移除空占位（abort 早于任何内容到达），有内容的打 aborted 标记
              const filtered = filterEmptyPlaceholder(
                sessionState.messages,
                streamingId
              );
              const messages = streamingId
                ? filtered.map((m) =>
                    m.id === streamingId ? { ...m, aborted: true } : m
                  )
                : filtered;
              newStates.set(sessionId, {
                ...sessionState,
                messages,
                isLoading: false,
                streamingMessageId: null,
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn aborted, partial kept', { sessionId });
          break;
        }

        case 'title_updated':
          logger.info('Title updated:', msg.title);
          useSessionStore
            .getState()
            .updateSessionTitleLocally(msg.sessionId, msg.title);
          break;
      }
    },
  };
});
