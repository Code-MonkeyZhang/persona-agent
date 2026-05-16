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
  SpeakReadyMessage,
  SpeakErrorMessage,
} from '../types/chat';
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

interface ChatStore {
  messages: Message[];
  connectionStatus: ConnectionStatus;
  isLoading: boolean;
  sessionId: string | null;
  agentId: string | null;
  lastUserMessage: string | null;
  wsClient: WebSocketClient | null;

  setConnectionStatus: (status: ConnectionStatus) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  setSessionId: (id: string | null) => void;
  setAgentId: (id: string | null) => void;
  clearMessages: () => void;
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

  setConnectionStatus: (status: ConnectionStatus) => {
    set({ connectionStatus: status });
  },

  addMessage: (message: Message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  setMessages: (messages: Message[]) => {
    set({ messages });
  },

  clearMessages: () => {
    set({ messages: [], lastUserMessage: null });
  },

  setSessionId: (id: string | null) => {
    set({ sessionId: id });
  },

  setAgentId: (id: string | null) => {
    set({ agentId: id });
  },

  setWsClient: (client: WebSocketClient | null) => {
    set({ wsClient: client });
  },

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
          'Cannot connect to server. Please ensure Agent Server is running.'
        )
      );
      toast.error('Cannot connect to server');
      return;
    }

    set({ lastUserMessage: content, isLoading: true });
    addMessage(createMessage('user', content));

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
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

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

      case 'complete':
        set({ isLoading: false });
        break;

      case 'speak_ready': {
        const speakMsg = msg as SpeakReadyMessage;
        const { voiceEnabled, speak } = useVoiceStore.getState();
        if (voiceEnabled) {
          void speak(
            speakMsg.speakText,
            speakMsg.voiceId,
            speakMsg.apiKey,
            speakMsg.model,
            speakMsg.languageBoost
          );
        }
        break;
      }

      case 'speak_error': {
        const errMsg = msg as SpeakErrorMessage;
        toast.warning(errMsg.message);
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
