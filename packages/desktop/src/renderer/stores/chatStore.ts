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
import { createMessage, sendChatMessage, WebSocketClient } from '../lib/api';
import { toast } from './toastStore';
import { logger } from '../lib/logger';
import { useSessionStore } from './sessionStore';
import { useCompanionStore } from './companionStore';
import { useVoiceStore } from './voiceStore';

/**
 * 将 step_complete 消息中的思考过程和工具调用转换为 Thought 数组。
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
 * 从消息内容提取预览文本：去除 HTML 标签后截取前 30 个字符。
 * @param content - 原始消息内容
 * @returns 30 字截断的纯文本预览
 */
function extractPreview(content: string): string {
  return content.replace(/<[^>]+>/g, '').slice(0, 30);
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
  handleWsMessage: (msg: ServerMessage) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setAgentId: (id: string | null) => void;
  setWsClient: (client: WebSocketClient | null) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
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

    // 追加用户消息，标记该 session 为加载中
    set((state) => {
      const newStates = new Map(state.sessionStates);
      const sessionState = newStates.get(sessionId) || {
        messages: [],
        isLoading: false,
        streamingMessageId: null,
      };
      newStates.set(sessionId, {
        messages: [...sessionState.messages, createMessage('user', content)],
        isLoading: true,
        streamingMessageId: null,
      });
      return { sessionStates: newStates, lastUserMessage: content };
    });

    // 同步更新会话预览
    useSessionStore
      .getState()
      .updateSessionPreview(sessionId, extractPreview(content));

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
            newStates.set(sessionId, { ...sessionState, isLoading: false });
          }
          return { sessionStates: newStates };
        });
      }
    } catch {
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const sessionState = newStates.get(sessionId);
        if (sessionState) {
          newStates.set(sessionId, { ...sessionState, isLoading: false });
        }
        return { sessionStates: newStates };
      });
    }
  },

  /**
   * 处理 WebSocket 推送消息，按 sessionId 路由到对应 session 的状态。
   * 所有 session 作用域事件均通过 msg.sessionId 定位 Map entry。
   */
  handleWsMessage: (msg: ServerMessage) => {
    switch (msg.type) {
      case 'subscribed':
        logger.info('Subscribed to session:', msg.sessionId);
        break;

      case 'step_complete': {
        const sessionId = msg.sessionId;
        const newThoughts = cycleToThoughts(msg);

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            if (tc.name === 'show_pose' && tc.arguments) {
              const args = tc.arguments as Record<string, unknown>;
              const pose = args.pose as string;
              if (pose) {
                useCompanionStore.getState().setPose(pose);
              }
            }
          }
        }

        // 在 set 回调外读取当前 sessionState，避免在回调内调用 get()
        const currentSnap = get();
        const sessionState = currentSnap.sessionStates.get(sessionId);
        if (sessionState) {
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
            .updateSessionPreview(sessionId, extractPreview(msg.content || ''));
        }
        break;
      }

      case 'complete': {
        const sessionId = msg.sessionId;
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId);
          if (sessionState) {
            newStates.set(sessionId, {
              ...sessionState,
              isLoading: false,
              streamingMessageId: null,
            });
          }
          return { sessionStates: newStates };
        });
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
                ...sessionState.messages,
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

      case 'title_updated':
        logger.info('Title updated:', msg.title);
        useSessionStore
          .getState()
          .updateSessionTitleLocally(msg.sessionId, msg.title);
        break;
    }
  },
}));
