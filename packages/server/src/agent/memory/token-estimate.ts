/**
 * @fileoverview 轻量 token 估算与消息文本化工具（CJK 感知的 chars/4 启发式）。
 */

import type { ContentBlock, Message } from '../../schema/index.js';

/** CJK / 全角字符的 token 权重（约 1.5 token/字） */
const CJK_WEIGHT = 1.5;
/** ASCII 字符的 token 权重（约 0.25 token/字符，即 4 字符 ≈ 1 token） */
const ASCII_WEIGHT = 0.25;

/**
 * 估算一段文本的 token 数量。
 *
 * CJK / 全角范围按 {@link CJK_WEIGHT} 计，其余（主要是 ASCII）按 {@link ASCII_WEIGHT} 计，
 * 两者相加向上取整。
 *
 * @param text - 待估算的文本
 * @returns 估算的 token 数
 */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    tokens += isCjk(ch) ? CJK_WEIGHT : ASCII_WEIGHT;
  }
  return Math.ceil(tokens);
}

/**
 * 判断单个字符是否属于 CJK / 全角范围（粗粒度，估算用，无需精确）。
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
 * `content` 可能是字符串或 {@link ContentBlock} 数组（多模态预留），
 * 此处只取文本部分；assistant 的 thinking（内部推理）不计入。
 */
function messageContentText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((b) => b.text ?? '').join('');
  }
  return '';
}

/**
 * 把单条消息格式化为 `role: content` 文本（供压缩输入拼接）。
 *
 * 仅保留对话事实（用户说了什么、助手回了什么），忽略 thinking 与 tool_calls。
 */
export function messageToText(msg: Message): string {
  return `${msg.role}: ${messageContentText(msg)}`;
}

/**
 * 估算单条消息的 token 数（含 role 前缀）。
 */
export function estimateMessageTokens(msg: Message): number {
  return estimateTokens(`${msg.role}: ${messageContentText(msg)}`);
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
