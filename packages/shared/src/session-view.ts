/**
 * @fileoverview 会话的客户端视图纯函数。
 *
 * 轮次边界混入与预览提取是服务端接口与桌面缓存共用的装配逻辑，
 * 收在 shared 保证两端产出同形数据。
 */

import type { Message, UserMessage } from './schema.js';
import { buildPreviewText } from './preview.js';

/**
 * 提取一条消息的纯文本，供预览使用。
 *
 * - 仅认 user / assistant 角色，其余角色（context、system、error、app_notification）返回 undefined
 * - user 的 content 兼容纯字符串与 ContentBlock 数组，数组取各 block 的 text 拼接
 * - assistant 纯工具步（无 content）返回 undefined，追加时不更新预览
 */
export function messagePreviewText(message: Message): string | undefined {
  if (message.role === 'user') {
    const content = message.content as UserMessage['content'];
    if (typeof content === 'string') return content;
    return content
      .map((block) => block.text ?? '')
      .join('')
      .trim();
  }
  if (message.role === 'assistant' && message.content) {
    return message.content;
  }
  return undefined;
}

/**
 * 从消息序列尾部提取会话预览文本。
 * 与服务端追加时维护预览列的取舍一致，跳过无可预览文本的消息。
 */
export function deriveSessionPreview(messages: Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = messagePreviewText(messages[i]);
    if (text && text.trim()) return buildPreviewText(text);
  }
  return undefined;
}

/**
 * 按 turnEnds 把轮次边界条目混入消息副本，渲染层扫描到边界即结组。
 *
 * - 边界条目借用 system 角色与 turnEnd 标志，走既有 system 跳过规则的消费方自然兼容
 * - 重复下标会连插边界条目，空缓冲结组是空操作，无害
 */
export function mixTurnEnds(
  messages: Message[],
  turnEnds: number[] | undefined
): Message[] {
  if (!turnEnds?.length) return messages;
  const result: Message[] = [];
  let cursor = 0;
  for (const count of turnEnds) {
    result.push(...messages.slice(cursor, count));
    result.push({ role: 'system', content: '', turnEnd: true });
    cursor = count;
  }
  result.push(...messages.slice(cursor));
  return result;
}
