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
import i18n from '../i18n';
import { useAgentStore } from './agentStore';
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
 * 把轮次缓冲组装成一条助手消息，可能为空。
 *
 * turn_complete 正常组装与 aborted / error 的半截冲刷共用。
 * - 最终回答的 content 同时存在于缓冲与最后一条 text thought，
 *   组装时移除该 thought 避免重复展示
 * - aborted 为 true 时打中止标记，保留已到达的部分内容
 * - 缓冲全空时返回空数组，不产空泡
 * @param state - 目标 session 的聊天状态
 * @param aborted - 是否按中止冲刷处理
 * @returns 待追加的助手消息数组
 */
function assemblePendingBubble(
  state: SessionChatState,
  aborted = false
): UIMessage[] {
  if (!state.pendingContent && state.pendingThoughts.length === 0) return [];
  const finalThoughts = stripLastTextThought(state.pendingThoughts);
  return [
    {
      id: crypto.randomUUID(),
      type: 'assistant',
      content: state.pendingContent,
      timestamp: new Date(),
      thoughts: finalThoughts.length > 0 ? finalThoughts : undefined,
      aborted: aborted || undefined,
    },
  ];
}

/** 轮次缓冲的空状态，供切换生成态与回合结束时复位 */
function emptyPending(): Pick<
  SessionChatState,
  'pendingThoughts' | 'pendingContent' | 'armedDiskRefresh'
> {
  return { pendingThoughts: [], pendingContent: '', armedDiskRefresh: false };
}

/**
 * 将 session 切到生成态。
 * 用于用户发消息以及 App 通知/恢复订阅触发的外部回合——
 * isLoading 置位后，步骤事件进轮次缓冲，turn_complete 到达时组装整轮气泡。
 */
function withLoadingState(sessionState: SessionChatState): SessionChatState {
  return {
    ...sessionState,
    ...emptyPending(),
    isLoading: true,
  };
}

/** 单个 session 的聊天状态 */
interface SessionChatState {
  messages: UIMessage[];
  isLoading: boolean;
  /** 当前轮的步骤缓冲，轮末组装成一条助手消息 */
  pendingThoughts: Thought[];
  pendingContent: string;
  /** 错过步骤事件的轮次由空缓冲 turn_complete 武装，round_complete 后从磁盘整包刷新 */
  armedDiskRefresh: boolean;
}

interface ChatStore {
  sessionStates: Map<string, SessionChatState>;
  currentSessionId: string | null;
  connectionStatus: ConnectionStatus;
  agentId: string | null;
  wsClient: WebSocketClient | null;

  setCurrentSessionId: (id: string | null) => void;
  initSessionState: (sessionId: string, messages: UIMessage[]) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  abortGeneration: (sessionId?: string) => void;
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
          ...emptyPending(),
        });
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
            ...emptyPending(),
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
            ...emptyPending(),
          });
          return { sessionStates: newStates };
        });
        toast.error('Cannot connect to server');
        return;
      }

      // 忙时插话：消息进服务端待注入缓冲，灰气泡由 pending_input_changed 广播渲染。
      // 不提前上屏，发送失败也就没有需要回滚的本地状态
      if (get().sessionStates.get(sessionId)?.isLoading) {
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
          if (result.success) {
            logger.info('Interjection sent while generating', {
              sessionId,
              pendingId: result.pendingId,
            });
          } else {
            logger.warn('Interjection rejected', {
              sessionId,
              error: result.error,
            });
            toast.error(i18n.t('inputBox.queueFailed'));
          }
        } catch {
          toast.error(i18n.t('inputBox.queueFailed'));
        }
        return;
      }

      // 乐观追加用户消息并切生成态，助手气泡由 turn_complete 从轮次缓冲组装
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const sessionState = newStates.get(sessionId) || {
          messages: [],
          isLoading: false,
          ...emptyPending(),
        };
        newStates.set(sessionId, {
          ...withLoadingState(sessionState),
          messages: [...sessionState.messages, createMessage('user', content)],
        });
        return { sessionStates: newStates };
      });
      logger.info('Message sent, loading state entered', { sessionId });

      // 同步更新会话预览
      useSessionStore
        .getState()
        .updateSessionPreview(sessionId, buildPreviewText(content));

      wsClient?.subscribe(sessionId);

      /** 失败回滚：结束生成态并清空轮次缓冲，乐观用户消息保留 */
      const rollbackLoading = () =>
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId);
          if (sessionState) {
            newStates.set(sessionId, {
              ...sessionState,
              isLoading: false,
              ...emptyPending(),
            });
          }
          return { sessionStates: newStates };
        });

      try {
        const voiceEnabled = useVoiceStore.getState().voiceEnabled;
        const result = await sendChatMessage(
          agentId,
          sessionId,
          content,
          voiceEnabled
        );
        if (!result.success) {
          rollbackLoading();
        }
      } catch {
        rollbackLoading();
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
              // 只增不减：仅在当前未加载时恢复，避免与 sendMessage 已切入的生成态冲突
              if (sessionState && !sessionState.isLoading) {
                newStates.set(sessionId, withLoadingState(sessionState));
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
          // 外部（App）触发的回合：与用户发消息一样切生成态，
          // 首步 step_complete 现场创建助手消息并填入，而非被 isLoading 守卫丢弃
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState && !sessionState.isLoading) {
              newStates.set(sessionId, withLoadingState(sessionState));
            }
            return { sessionStates: newStates };
          });
          logger.info('App notification received', {
            sessionId,
            source: msg.source,
          });
          break;
        }

        case 'pending_input_changed': {
          // 待注入缓冲全量同步：未知条目补灰气泡，注入取空时灰气泡转正常
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (!sessionState) return {};
            const pendingIds = new Set(msg.pending.map((p) => p.id));
            // 灰气泡随广播创建并自带 pendingId，不在服务端列表即已注入
            const messages = sessionState.messages.map((m) =>
              m.queued && m.pendingId && !pendingIds.has(m.pendingId)
                ? { ...m, queued: false }
                : m
            );
            // 服务端有而本地没有的条目：本窗口刚发的与其他客户端写入的插话，补灰气泡；
            // app 来源的通知不在聊天窗口显示，直接过滤
            const localPendingIds = new Set(
              messages
                .filter((m) => m.pendingId)
                .map((m) => m.pendingId as string)
            );
            const additions = msg.pending
              .filter((p) => !localPendingIds.has(p.id) && p.source !== 'app')
              .map((p) =>
                createMessage('user', p.content, {
                  queued: true,
                  pendingId: p.id,
                  source: p.source === 'app' ? ('app' as const) : undefined,
                  sourceName: p.sourceName,
                })
              );
            newStates.set(sessionId, {
              ...sessionState,
              messages: [...messages, ...additions],
            });
            return { sessionStates: newStates };
          });
          logger.info('Pending inputs synced', {
            sessionId,
            pendingCount: msg.pending.length,
            appFiltered: msg.pending.filter((p) => p.source === 'app').length,
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
            // 防御：本回合已结束后迟到的 step_complete 直接丢弃，不污染下一轮缓冲
            if (!sessionState.isLoading) {
              logger.info('Late step_complete ignored', { sessionId });
              break;
            }

            // 步骤只进轮次缓冲，界面无中间助手内容，turn_complete 到达时整轮组装
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const ss = newStates.get(sessionId);
              if (!ss) return {};
              newStates.set(sessionId, {
                ...ss,
                pendingThoughts: [...ss.pendingThoughts, ...newThoughts],
                pendingContent: msg.content || ss.pendingContent,
              });
              return { sessionStates: newStates };
            });

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

        case 'turn_complete': {
          const sessionId = msg.sessionId;
          const sessionState = get().sessionStates.get(sessionId);
          if (!sessionState) break;

          const bubble = assemblePendingBubble(sessionState);

          // 空缓冲说明重载后错过了本轮步骤事件，武装刷新标志，
          // round_complete 后从磁盘整包刷新，不打断其他客户端仍在收的后续轮次
          if (bubble.length === 0) {
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const ss = newStates.get(sessionId);
              if (ss) {
                newStates.set(sessionId, { ...ss, armedDiskRefresh: true });
              }
              return { sessionStates: newStates };
            });
            logger.info('Turn end with empty buffer, arming disk refresh', {
              sessionId,
            });
            break;
          }

          // 组装整轮气泡追加到末尾，追加天然形成聊天顺序，插话灰气泡排在整轮之上
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (ss) {
              newStates.set(sessionId, {
                ...ss,
                messages: [...ss.messages, ...bubble],
                pendingThoughts: [],
                pendingContent: '',
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn bubble assembled', {
            sessionId,
            thoughtCount: bubble[0]?.thoughts?.length ?? 0,
            contentLength: bubble[0]?.content.length ?? 0,
          });
          break;
        }

        case 'round_complete': {
          const sessionId = msg.sessionId;
          const snap = get();
          const sessionState = snap.sessionStates.get(sessionId);
          if (!sessionState) break;
          const needsRefresh = sessionState.armedDiskRefresh;

          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (ss) {
              newStates.set(sessionId, {
                ...ss,
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });

          if (needsRefresh) {
            logger.info('Round complete, refreshing from disk', { sessionId });
            void refreshSessionMessages(sessionId);
          } else {
            logger.info('Round complete', { sessionId });
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

        case 'workspace_fallback': {
          // 工作目录失效已被写回配置：提示用户并刷新 Agent 与会话的路径显示
          toast.warning(
            i18n.t('workspace.fallbackNotice', { path: msg.fallbackPath })
          );
          void useAgentStore.getState().loadAgents();
          void useSessionStore.getState().loadSessions(msg.agentId);
          break;
        }

        case 'error': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              // 缓冲冲刷成半截气泡再退出，与刷新链路的 error 结组口径一致
              newStates.set(sessionId, {
                ...sessionState,
                messages: [
                  ...sessionState.messages,
                  ...assemblePendingBubble(sessionState),
                  createMessage('error', msg.message),
                ],
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn errored, partial flushed', { sessionId });
          break;
        }

        case 'aborted': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              // 缓冲冲刷成带中止标记的半截气泡，保留部分内容
              newStates.set(sessionId, {
                ...sessionState,
                messages: [
                  ...sessionState.messages,
                  ...assemblePendingBubble(sessionState, true),
                ],
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn aborted, partial flushed', { sessionId });
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
