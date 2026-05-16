/**
 * @file src/renderer/types/chat.ts
 * @description 聊天消息与 WebSocket 消息类型定义，覆盖客户端请求和服务端推送全链路消息格式
 */

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

type MessageType = 'user' | 'assistant' | 'error';

/**
 * Thought type for representing agent's reasoning process
 * - thinking: AI's internal reasoning
 * - tool_use: Tool call with optional result
 * - error: System error
 */
export type ThoughtType = 'thinking' | 'tool_use' | 'error';

/**
 * Tool result from execution
 */
interface ToolResult {
  output: string;
  isError?: boolean;
}

/**
 * Single thought item in the reasoning process
 */
export interface Thought {
  id: string;
  type: ThoughtType;
  timestamp: Date;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: ToolResult;
  duration?: number;
  isError?: boolean;
}

export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  /** Agent's reasoning process */
  thoughts?: Thought[];
}

/**
 * WebSocket message types
 */

interface ConnectedMessage {
  type: 'connected';
  clientId: string;
}

interface SubscribedMessage {
  type: 'subscribed';
  sessionId: string;
}

interface WsToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface WsToolResult {
  toolCallId: string;
  toolName: string;
  result: string;
  success: boolean;
}

export interface StepCompleteMessage {
  type: 'step_complete';
  sessionId: string;
  stepIndex: number;
  thinking?: string;
  content?: string;
  toolCalls?: WsToolCall[];
  toolResults?: WsToolResult[];
}

interface CompleteMessage {
  type: 'complete';
  sessionId: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

interface TitleUpdatedMessage {
  type: 'title_updated';
  sessionId: string;
  title: string;
}

export interface SpeakReadyMessage {
  type: 'speak_ready';
  sessionId: string;
  speakText: string;
  voiceId: string;
  apiKey: string;
  model: string;
  languageBoost?: string;
}

export interface SpeakErrorMessage {
  type: 'speak_error';
  sessionId: string;
  reason: 'no_api_key' | 'no_voice_id' | 'no_content' | 'voice_not_found';
  message: string;
}

export type ServerMessage =
  | ConnectedMessage
  | SubscribedMessage
  | StepCompleteMessage
  | CompleteMessage
  | ErrorMessage
  | TitleUpdatedMessage
  | SpeakReadyMessage
  | SpeakErrorMessage;
