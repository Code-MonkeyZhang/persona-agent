/**
 * @file renderer/stores/chatStore.ts
 * @description 聊天状态管理 - 负责消息发送、WebSocket 消息接收分发与聊天状态维护
 */

import { create } from 'zustand';
import type {
  Message,
  ConnectionStatus,
  Thought,
  ServerMessage,
  StepCompleteMessage,
} from '../types/chat';
import {
  checkServerStatus,
  createMessage,
  sendChatMessage,
  WebSocketClient,
} from '../lib/api';
import { toast } from './toastStore';
import { logger } from '../lib/logger';
import { useSessionStore } from './sessionStore';
import { useCompanionStore } from './companionStore';
import { useVoiceStore } from './voiceStore';
import { useAgentStore } from './agentStore';

/**
 * 从数组末尾向前查找最后一个满足条件的元素索引。
 * @param arr - 目标数组
 * @param predicate - 判断条件
 * @returns 找到的索引，未找到返回 -1
 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) {
      return i;
    }
  }
  return -1;
}

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

interface ChatStore {
  messages: Message[];
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  sessionId: string | null;
  agentId: string | null;
  lastUserMessage: string | null;
  wsClient: WebSocketClient | null;

  checkConnection: () => Promise<void>;
  setConnectionStatus: (status: ConnectionStatus) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setSessionId: (id: string | null) => void;
  setAgentId: (id: string | null) => void;
  clearMessages: () => void;
  removeLastError: () => void;
  handleWsMessage: (msg: ServerMessage) => void;
  setWsClient: (client: WebSocketClient | null) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  connectionStatus: 'disconnected',
  isLoading: false,
  sessionId: null,
  agentId: null,
  lastUserMessage: null,
  wsClient: null,

  /** 检查与服务器的连接状态，更新 connectionStatus。 */
  checkConnection: async () => {
    set({ connectionStatus: 'connecting' });
    const isConnected = await checkServerStatus();
    set({ connectionStatus: isConnected ? 'connected' : 'disconnected' });
  },

  /** 设置连接状态。 */
  setConnectionStatus: (status: ConnectionStatus) => {
    set({ connectionStatus: status });
  },

  /** 向消息列表末尾追加一条消息。 */
  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  /** 整体替换消息列表。 */
  setMessages: (messages: Message[]) => {
    set({ messages });
  },

  /** 清空消息列表和上次发送的消息记录。 */
  clearMessages: () => {
    set({ messages: [], lastUserMessage: null });
  },

  /** 设置当前会话 ID。 */
  setSessionId: (id: string | null) => {
    set({ sessionId: id });
  },

  /** 设置当前 Agent ID。 */
  setAgentId: (id: string | null) => {
    set({ agentId: id });
  },

  /** 移除消息列表中最后一条 error 类型的消息。 */
  removeLastError: () => {
    set((state) => {
      const messages = [...state.messages];
      const lastErrorIndex = findLastIndex(messages, (m) => m.type === 'error');
      if (lastErrorIndex >= 0) {
        messages.splice(lastErrorIndex, 1);
      }
      return { messages };
    });
  },

  /** 设置 WebSocket 客户端实例。 */
  setWsClient: (client: WebSocketClient | null) => {
    set({ wsClient: client });
  },

  /**
   * 通过 HTTP POST 发送聊天消息，同时通过 WebSocket 订阅会话事件以接收响应。
   * @param content - 消息文本内容
   * @param explicitSessionId - 可选的会话 ID，不传则使用 store 中当前的 sessionId
   */
  sendMessage: async (content: string, explicitSessionId?: string) => {
    const state = get();
    const sessionId = explicitSessionId || state.sessionId;
    const agentId = state.agentId;
    const { addMessage, connectionStatus, wsClient } = state;

    if (!agentId || !sessionId) {
      toast.error('No agent or session selected');
      return;
    }

    if (connectionStatus !== 'connected') {
      addMessage(createMessage('user', content));
      addMessage(
        createMessage(
          'error',
          'Cannot connect to server. Please ensure Nano-Agent server is running.'
        )
      );
      toast.error('Cannot connect to server');
      return;
    }

    set({ lastUserMessage: content, isLoading: true });
    addMessage(createMessage('user', content));

    wsClient?.subscribe(sessionId);

    try {
      const result = await sendChatMessage(agentId, sessionId, content);
      if (!result.success) {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  /** 重新发送上次的消息，先移除最后的错误消息和原用户消息再调用 sendMessage。 */
  retryLastMessage: async () => {
    const state = get();
    const { lastUserMessage, sessionId, connectionStatus } = state;

    if (!lastUserMessage) {
      toast.warning('No message to retry');
      return;
    }

    if (connectionStatus !== 'connected') {
      toast.error('Cannot connect to server');
      return;
    }

    get().removeLastError();

    const lastUserIndex = findLastIndex(
      state.messages,
      (m) => m.type === 'user'
    );
    if (lastUserIndex >= 0) {
      set((state) => {
        const messages = [...state.messages];
        messages.splice(lastUserIndex, 1);
        return { messages };
      });
    }

    await get().sendMessage(lastUserMessage, sessionId || undefined);
  },

  /**
   * 处理 WebSocket 推送的服务端消息，根据消息类型分别处理：
   * - step_complete：转换为带 thoughts 的 assistant 消息并追加
   * - complete：结束加载状态
   * - error：追加错误消息并结束加载
   * - title_updated：更新本地会话标题
   * @param msg - 服务端推送的消息
   */
  handleWsMessage: (msg: ServerMessage) => {
    const { addMessage } = get();

    switch (msg.type) {
      case 'subscribed':
        logger.info('Subscribed to session:', msg.sessionId);
        break;

      case 'step_complete': {
        const thoughts = cycleToThoughts(msg);

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

        addMessage({
          id: crypto.randomUUID(),
          type: 'assistant',
          content: msg.content || '',
          timestamp: new Date(),
          thoughts,
        });
        break;
      }

      case 'complete': {
        set({ isLoading: false });

        const companionVisible = useCompanionStore.getState().visible;
        const { voiceEnabled, speak } = useVoiceStore.getState();
        const agent = useAgentStore.getState().currentAgent;

        if (companionVisible && voiceEnabled && agent?.voiceId) {
          const { messages, sessionId, agentId } = get();
          if (sessionId && agentId) {
            const lastAssistant = [...messages]
              .reverse()
              .find((m) => m.type === 'assistant');
            if (lastAssistant?.content) {
              void speak(
                lastAssistant.content,
                agent.voiceId,
                agentId,
                sessionId
              );
            }
          }
        }
        break;
      }

      case 'error':
        addMessage(createMessage('error', msg.message));
        set({ isLoading: false });
        break;

      case 'title_updated':
        logger.info('Title updated:', msg.title);
        useSessionStore
          .getState()
          .updateSessionTitleLocally(msg.sessionId, msg.title);
        break;
    }
  },
}));
