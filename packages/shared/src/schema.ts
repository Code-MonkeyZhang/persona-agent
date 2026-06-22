/**
 * 消息的核心类型定义。
 *
 * Message 联合（system / user / assistant）描述 server↔desktop 之间传递的消息格式。
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
}

export type Message = SystemMessage | UserMessage | AssistantMessage;
