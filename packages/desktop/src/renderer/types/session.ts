/**
 * @file src/renderer/types/session.ts
 * @description Session 相关类型定义，包含会话元数据、完整会话、服务端消息格式及 API 响应类型
 */

/**
 * Session metadata without full message history.
 * Used for displaying session list.
 */
export interface SessionMeta {
  id: string;
  title: string;
  agentId: string;
  model: {
    provider: string;
    model: string;
  };
  workspacePath?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Complete session with full message history.
 */
export interface Session extends SessionMeta {
  messages: SessionMessage[];
}

/**
 * Message format from server.
 */
export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  tool_calls?: {
    id: string;
    type: string;
    function: {
      name: string;
      arguments: Record<string, unknown>;
    };
    toolResult?: {
      content: string;
      isError: boolean;
    };
  }[];
}
