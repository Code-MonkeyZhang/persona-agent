/**
 * @file src/renderer/types/chat.ts
 * @description 聊天消息与 WebSocket 消息类型定义，覆盖客户端请求和服务端推送全链路消息格式
 */

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export type MessageType = 'user' | 'assistant' | 'error';

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
export interface ToolResult {
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

export interface SubscribeRequest {
  type: 'subscribe';
  payload: { sessionId: string };
}

export interface UnsubscribeRequest {
  type: 'unsubscribe';
  payload: { sessionId: string };
}

export interface ConnectedMessage {
  type: 'connected';
  clientId: string;
}

export interface SubscribedMessage {
  type: 'subscribed';
  sessionId: string;
}

export interface WsToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface WsToolResult {
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

export interface CompleteMessage {
  type: 'complete';
  sessionId: string;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface TitleUpdatedMessage {
  type: 'title_updated';
  sessionId: string;
  title: string;
}

export type ServerMessage =
  | ConnectedMessage
  | SubscribedMessage
  | StepCompleteMessage
  | CompleteMessage
  | ErrorMessage
  | TitleUpdatedMessage;
