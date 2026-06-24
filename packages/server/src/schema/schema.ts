/**
 * @fileoverview 消息的核心类型定义。
 *
 * 主要类型已迁移至 @persona/shared，此处保留 ToolResultMessage。
 */

export type {
  ContentBlock,
  SystemMessage,
  UserMessage,
  ToolCall,
  AssistantMessage,
  Message,
} from '@persona/shared';

/**
 * 包含执行结果的工具结果消息。
 * 工具执行完成后发送回模型。
 *
 * 此类型被排除在 Message 联合之外，只用于 agent 内部运行状态，不上线。
 */
export interface ToolResultMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  tool_name?: string;
}
