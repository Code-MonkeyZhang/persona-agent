/**
 * @file src/renderer/types/chat.ts
 * @description 聊天界面的视图模型类型。
 * WS 协议类型已迁移至 @persona/shared。
 */

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

type MessageType = 'user' | 'assistant' | 'error';

/**
 * Thought type for representing agent's reasoning process
 * - thinking: AI's internal reasoning
 * - text: AI's intermediate text response shown in timeline
 * - tool_use: Tool call with optional result
 * - error: System error
 */
export type ThoughtType = 'thinking' | 'text' | 'tool_use' | 'error';

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

export interface UIMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  /** Agent's reasoning process */
  thoughts?: Thought[];
}
