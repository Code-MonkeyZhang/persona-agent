/**
 * 消息的核心类型定义。
 *
 * Message 联合描述 server↔desktop 之间传递的消息格式。
 * ToolResultMessage 不在此联合中——它是 agent 内部运行状态，不上线，保留在 server。
 * TODO: 如果支持多模态这些都要改
 */

/**
 * 多模态消息的内容块。
 * TODO: 目前支持文本，但可扩展为其他内容类型。
 */
export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/** 包含 system prompt 的系统消息。 */
export interface SystemMessage {
  role: 'system';
  content: string;
}

export interface UserMessage {
  role: 'user';
  content: string | ContentBlock[];
}

/**
 * 助手消息中的工具调用。
 * 表示模型请求的函数调用。
 */
export interface ToolCall {
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
}

/** 助手消息，包含可选的思考和工具调用。 */
export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  thinking?: string;
  tool_calls?: ToolCall[];
  stopReason?: 'aborted';
}

/** 错误消息，持久化 API 调用失败等信息，占助手槽位注入模型上下文 */
export interface ErrorMessage {
  role: 'error';
  content: string;
}

/**
 * Agent App 通知消息。
 *
 * 存储层独立于 user/assistant，永不改写。
 * 运行时由 chat-service 转成带前缀的 user 消息发给 LLM。
 */
export interface AppNotificationMessage {
  role: 'app_notification';
  /** App 名称，与 mcp.json 的 key 一致 */
  source: string;
  /** 给 Agent 看的自然语言消息 */
  content: string;
}

/**
 * 运行时上下文注入消息。
 *
 * 存储层独立角色，落盘到 session JSONL，前端不渲染。
 * 内容为当前时间与距上一条消息的时长、环境变化通知。
 * 加载历史时由 chat-service 转成 user 消息发给 LLM。
 */
export interface ContextMessage {
  role: 'context';
  /** 注入来源标识，当前固定为 runtime-context */
  source: 'runtime-context';
  /** 给模型看的时间与环境变化文本 */
  content: string;
}

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ErrorMessage
  | AppNotificationMessage
  | ContextMessage;
