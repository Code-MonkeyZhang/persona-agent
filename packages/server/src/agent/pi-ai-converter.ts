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
  ImageContent,
  ThinkingContent,
  ToolCall as PiAiToolCall,
  JsonObject,
} from '@earendil-works/pi-ai';
import * as fs from 'node:fs';
import type {
  Message,
  ToolCall,
  ContentBlock,
  FileContent,
} from '../schema/index.js';
import type { Tool } from '../tools/index.js';
import { getAttachment } from '../server/services/attachment-store.js';
import { getAttachmentsDir } from '../util/paths.js';
import { Logger } from '../util/logger.js';

/**
 * 字节数的可读格式，句柄投影使用。
 *
 * @param bytes - 字节数
 * @returns 形如 239.8KB 的可读字符串
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)}GB`;
}

/**
 * 文件块的句柄投影文本。
 * 纯字符串拼接不读盘，ReAct 循环每步重复执行无成本。
 *
 * @param block - 文件内容块
 * @returns 引导模型用 read_file 取内容的英文句柄
 */
function formatFileHandle(block: FileContent): string {
  return [
    `[Attached file: ${block.name} · ${formatFileSize(block.bytes)}]`,
    'The user attached this file. It is stored read-only at:',
    `${getAttachmentsDir()}/${block.hash}`,
    'Read it with the read_file tool when you need its contents.',
    'To modify it, first copy it to the workspace.',
  ].join('\n');
}

/**
 * 将单个内容块转换为 pi-ai 的用户内容。
 *
 * - 文本块直映射
 * - 图片块按哈希读附件仓转 base64，仓里的字节即客户端压缩后的最终产物
 * - 文件块投影为句柄文本，模型经 read_file 按路径读取
 * - 图片未命中或登记格式非图片时降级为占位文本，不打断整轮
 *
 * @param block - 内部内容块
 * @returns pi-ai 的文本或图片内容
 */
function convertContentBlock(block: ContentBlock): TextContent | ImageContent {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'image') {
    const attachment = getAttachment(block.hash);
    if (!attachment || !attachment.format.startsWith('image/')) {
      Logger.log(
        'ATTACHMENT',
        `Image attachment unavailable, degraded to text: ${block.hash}`
      );
      return {
        type: 'text',
        text: `[Attachment unavailable: ${block.hash}]`,
      };
    }
    const data = fs.readFileSync(attachment.filePath).toString('base64');
    return { type: 'image', data, mimeType: attachment.format };
  }
  return { type: 'text', text: formatFileHandle(block) };
}
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
 * 模型无视觉时的图片降级由 SDK 的 transformMessages 承担，此处零降级代码。
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
            : msg.content.map(convertContentBlock),
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
