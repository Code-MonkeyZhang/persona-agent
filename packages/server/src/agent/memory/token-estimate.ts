/**
 * @fileoverview 轻量 token 估算与消息文本化工具。
 *
 * 中文感知密度加结构计价：CJK 权重与 ASCII 权重承担文本密度，
 * 消息头、内容块标签、图片与 PDF 按固定值计入，口径只算发给模型的部分。
 */

import type { Message } from '../../schema/index.js';
import type { Tool } from '../../tools/base.js';
import type { SystemPromptSegments } from '../types.js';

/** CJK / 全角字符的 token 权重 */
const CJK_WEIGHT = 1.5;
/** ASCII 字符的 token 权重 */
const ASCII_WEIGHT = 0.25;
/** 每条消息的 role 序列化开销，固定 token 数 */
const MESSAGE_OVERHEAD = 4;
/** 每个内容块的类型标签开销，固定 token 数 */
const BLOCK_TAG_OVERHEAD = 2;
/** 图片块固定估算，照抄 opencode 每张一千五 */
const IMAGE_TOKENS = 1500;
/** PDF 文件块固定估算，照抄 opencode 每份两千 */
const PDF_TOKENS = 2000;

/**
 * 估算一段纯文本的 token 数量。
 *
 * CJK / 全角范围按 {@link CJK_WEIGHT} 计，其余按 {@link ASCII_WEIGHT} 计，
 * 两者相加向上取整。
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数
 */
export function estimateTextTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += isCjk(ch) ? CJK_WEIGHT : ASCII_WEIGHT;
  }
  return Math.ceil(tokens);
}

/**
 * 估算工具装配产物的 token 数量，投影序列化后按密度计。
 *
 * 只测发给模型的投影，即名字加说明加参数说明三字段。
 * 工具实例身上的执行函数与连接引用不参与计价，MCP 工具
 * 持有的活客户端对象带循环引用，整份实例序列化会抛错。
 *
 * @param tools - runConfig.tools 形态的工具数组
 * @returns 估算的 token 数
 */
export function estimateToolsTokens(tools: Tool[]): number {
  const projection = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  return estimateTextTokens(JSON.stringify(projection));
}

/**
 * 估算装配产物的两段 token 数。
 *
 * systemPersona 取 segments 的 core 段，toolsSkills 取 skills 段加工具投影，
 * segments 缺席时 systemPersona 与 skills 部分按零计，与派轮三段构成的既有口径一致。
 *
 * @param segments - system prompt 分段，可选保证渐进兼容
 * @param tools - runConfig.tools 形态的工具数组
 * @returns systemPersona 与 toolsSkills 两段估算
 */
export function estimateAssemblyTokens(
  segments: SystemPromptSegments | undefined,
  tools: Tool[]
): { systemPersona: number; toolsSkills: number } {
  return {
    systemPersona: segments ? estimateTextTokens(segments.core) : 0,
    toolsSkills:
      (segments ? estimateTextTokens(segments.skills) : 0) +
      estimateToolsTokens(tools),
  };
}

/**
 * 判断单个字符是否属于 CJK / 全角范围。
 */
function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return (
    (code >= 0x3000 && code <= 0x30ff) || // CJK 标点 + 假名
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0xac00 && code <= 0xd7af) || // 韩文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意
    (code >= 0xff00 && code <= 0xffef) // 全角字符
  );
}

/**
 * 提取单条消息的纯文本内容。
 *
 * `content` 可能是字符串或 {@link ContentBlock} 数组，
 * 数组取文本块的 text 与文件块的文件名，图片块跳过；
 * assistant 的 thinking 不计入。
 */
export function messageContentText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((b) =>
        b.type === 'text' ? b.text : b.type === 'file' ? b.name : ''
      )
      .join('');
  }
  return '';
}

/**
 * 把单条消息格式化为 `role: content` 文本。
 *
 * 仅保留对话事实，忽略 thinking 与 tool_calls。
 */
export function messageToText(msg: Message): string {
  return `${msg.role}: ${messageContentText(msg)}`;
}

/** 判断文件名是否为 PDF */
function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

/**
 * 估算单个内容块的 token 数。
 *
 * text 块按密度计，image 块按固定值，file 块里 pdf 按固定值其余按文件名密度，
 * 认不出的块按 JSON 序列化长度密度计。
 */
function estimateBlockTokens(block: { type: string }): number {
  const b = block as { type: string; text?: string; name?: string };
  if (b.type === 'text') return estimateTextTokens(b.text ?? '');
  if (b.type === 'image') return IMAGE_TOKENS;
  if (b.type === 'file') {
    return isPdfName(b.name ?? '')
      ? PDF_TOKENS
      : estimateTextTokens(b.name ?? '');
  }
  return estimateTextTokens(JSON.stringify(block));
}

/**
 * 估算单条消息的 token 数。
 *
 * 每条消息先加 {@link MESSAGE_OVERHEAD} 承担 role 序列化开销，
 * 内容块逐块加 {@link BLOCK_TAG_OVERHEAD} 再按类型计价，
 * tool_calls 的函数名与参数分别按密度计，thinking 维持不计的既有口径。
 */
export function estimateMessageTokens(msg: Message): number {
  let total = MESSAGE_OVERHEAD;

  if (typeof msg.content === 'string') {
    total += estimateTextTokens(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      total += BLOCK_TAG_OVERHEAD + estimateBlockTokens(block);
    }
  }

  // tool_calls 只在 assistant 消息上，in 收窄后逐个按密度计
  const toolCalls = 'tool_calls' in msg ? msg.tool_calls : undefined;
  if (toolCalls) {
    for (const toolCall of toolCalls) {
      total += BLOCK_TAG_OVERHEAD;
      total += estimateTextTokens(toolCall.function.name);
      total += estimateTextTokens(
        JSON.stringify(toolCall.function.arguments ?? {})
      );
    }
  }

  return total;
}

/**
 * 估算一组消息的 token 总数。
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}
