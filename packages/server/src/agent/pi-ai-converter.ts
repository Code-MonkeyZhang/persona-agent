/**
 * @fileoverview 内部类型与pi-ai格式之间的转换层。
 */

import type {
  Context,
  Message as PiAiMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Tool as PiAiTool,
  TextContent,
  ThinkingContent,
  ToolCall as PiAiToolCall,
  JsonObject,
} from '@earendil-works/pi-ai';
import type { Message, ToolCall } from '../schema/index.js';
import type { Tool } from '../tools/index.js';
import { isToolNarrationEnabled } from '../config.js';

/** 注入栏位的键名，短标题两到四词，意图一到两句，模型每次调用工具必填 */
const NARRATION_TITLE_KEY = '_title';
const NARRATION_INTENT_KEY = '_intent';

/**
 * 给工具 schema 注入模型自写叙述的两个必填栏位。
 * 模型调用工具时顺手填写这两栏，agent 层在事件源头剥离，
 * 工具实现与后续上下文都看不到注入的键。
 * @param schema 原始 JSON Schema
 * @returns 补齐注入栏位的新 schema，原对象不改
 */
export function injectNarrationFields(
  schema: Record<string, unknown>
): Record<string, unknown> {
  const properties = {
    ...(schema['properties'] as Record<string, unknown> | undefined),
    [NARRATION_TITLE_KEY]: {
      type: 'string',
      description:
        'REQUIRED: 用户界面的实时步骤条会直接显示这个短标题，用两到四个中文词说清本次调用在做什么，例如「查滴答清单待办」',
    },
    [NARRATION_INTENT_KEY]: {
      type: 'string',
      description:
        'REQUIRED: 用一到两句中文说明本次调用的目的，写给用户看，例如「查看近两周的吃药提醒任务」',
    },
  };
  const required = [
    ...((schema['required'] as string[] | undefined) ?? []),
    NARRATION_TITLE_KEY,
    NARRATION_INTENT_KEY,
  ];
  return { ...schema, properties, required };
}

/**
 * 从工具参数剥出注入的叙述栏位并挂到 ToolCall 顶层可选字段。
 * 开关关闭时模型没见过这两栏，参数里无键即原样返回。
 * @param toolCall 待剥离的内部工具调用
 */
export function stripNarrationFields(toolCall: ToolCall): void {
  const args = toolCall.function.arguments;
  if (!args) return;
  if (NARRATION_TITLE_KEY in args) {
    const title = args[NARRATION_TITLE_KEY];
    delete args[NARRATION_TITLE_KEY];
    if (typeof title === 'string' && title) toolCall.toolTitle = title;
  }
  if (NARRATION_INTENT_KEY in args) {
    const intent = args[NARRATION_INTENT_KEY];
    delete args[NARRATION_INTENT_KEY];
    if (typeof intent === 'string' && intent) toolCall.toolIntent = intent;
  }
}

/**
 * 将内部Message数组转换为pi-ai Message数组。
 * 处理用户、助手、错误和工具消息。
 * 错误消息映射为助手消息，占助手槽位以维持角色交替。
 *
 * @param messages - 内部消息对象数组
 * @returns pi-ai格式的消息数组
 */
function convertMessages(messages: Message[]): PiAiMessage[] {
  const result: PiAiMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      const userMsg: UserMessage = {
        role: 'user',
        content:
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
                .filter((b) => b.type === 'text')
                .map((b) => ({ type: 'text', text: b.text ?? '' })),
        timestamp: Date.now(),
      };
      result.push(userMsg);
    } else if (msg.role === 'assistant') {
      const content: (TextContent | ThinkingContent | PiAiToolCall)[] = [];

      if (msg.thinking) {
        content.push({ type: 'thinking', thinking: msg.thinking });
      }

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.function.name,
            // 内部 schema 存 Record<string, unknown>，入 pi-ai 边界收窄为 JsonObject，
            // 值实际来自模型 JSON 参数，此处断言由转换层担保。
            arguments: tc.function.arguments as JsonObject,
          });
        }
      }

      const assistantMsg: AssistantMessage = {
        role: 'assistant',
        content,
        api: 'openai-completions',
        provider: 'openai',
        model: '',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      };
      result.push(assistantMsg);

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.toolResult) {
            const toolResultMsg: ToolResultMessage = {
              role: 'toolResult',
              toolCallId: tc.id,
              toolName: tc.function.name,
              content: [{ type: 'text', text: tc.toolResult.content }],
              isError: tc.toolResult.isError,
              timestamp: Date.now(),
            };
            result.push(toolResultMsg);
          }
        }
      }
    } else if (msg.role === 'error') {
      result.push({
        role: 'assistant',
        content: [{ type: 'text', text: msg.content }],
        api: 'openai-completions',
        provider: 'openai',
        model: '',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      });
    }
  }

  return result;
}

/**
 * 将内部Tool数组转换为pi-ai Tool数组。
 * pi-ai 对 parameters 只做原样透传且支持完整 JSON Schema，
 * 原始 schema 直接随 Context 下发，叙述开关开启时先注入两个必填栏位，
 * description 与 enum 等关键字全程不丢失，两家请求格式共用同一份 Context。
 *
 * @param tools - 内部Tool实例数组
 * @returns pi-ai格式的工具定义数组
 */
function convertTools(tools: Tool[]): PiAiTool[] {
  const narrate = isToolNarrationEnabled();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    parameters: narrate
      ? injectNarrationFields(tool.parameters)
      : tool.parameters,
  }));
}

/**
 * 将pi-ai ToolCall转换为内部ToolCall格式。
 *
 * @param toolCall - pi-ai ToolCall对象
 * @returns 带有function包装的内部ToolCall
 */
export function convertPiAiToolCall(toolCall: PiAiToolCall): ToolCall {
  return {
    id: toolCall.id,
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: toolCall.arguments,
    },
  };
}

/**
 * 从系统提示、消息和工具创建pi-ai Context。
 *
 * @param systemPrompt - 模型的系统指令
 * @param messages - 对话历史
 * @param tools - 模型可用的工具
 * @returns 准备好用于流式处理的pi-ai Context对象
 */
export function convertContext(
  systemPrompt: string,
  messages: Message[],
  tools: Tool[]
): Context {
  return {
    systemPrompt,
    messages: convertMessages(messages),
    tools: convertTools(tools),
  };
}
