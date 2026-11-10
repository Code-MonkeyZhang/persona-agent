/**
 * @file src/renderer/types/chat.ts
 * @description 聊天界面的视图模型类型。
 * WS 协议类型已迁移至 @persona/shared。
 */

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected';

/** 附件草稿期与发送期的状态机，进消息后不再变化 */
export type AttachmentStatus = 'ready' | 'uploading' | 'uploaded' | 'error';

/** 输入框与消息气泡共用的附件视图模型 */
export interface UIAttachment {
  id: string;
  kind: 'image' | 'file';
  /** 草稿期为 objectURL，发送后随消息驻留，历史恢复时为协议地址 */
  url?: string;
  name: string;
  bytes: number;
  width?: number;
  height?: number;
  status: AttachmentStatus;
  /** 上传落定或历史块携带的内容哈希 */
  hash?: string;
  /** 上传响应的 format 或历史块携带的 mimeType */
  mimeType?: string;
}

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
  /** 模型自写的本次调用短标题，显示取值链第一优先 */
  toolTitle?: string;
  /** 模型自写的本次调用意图，轮末收起行优先显示 */
  toolIntent?: string;
  /** MCP 工具所属服务的 logo 图址，随落盘步骤回放，历史行复用 */
  iconUrl?: string;
  toolResult?: ToolResult;
  duration?: number;
  isError?: boolean;
}

export interface UIMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  thoughts?: Thought[];
  aborted?: boolean;
  /** 用户消息携带的附件，仅 user 消息使用 */
  attachments?: UIAttachment[];
  /** 待注入状态：忙时插话尚未被 Agent 消费 */
  queued?: boolean;
  /** 服务端缓冲条目 id，用于与 pending_input_changed 对账 */
  pendingId?: string;
  /** 消息来源标记：app 表示来自 Agent App 通知 */
  source?: 'app';
  /** App 来源展示名 */
  sourceName?: string;
}
