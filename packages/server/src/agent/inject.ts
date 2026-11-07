/**
 * @fileoverview 待注入消息进入 Agent 上下文的文本形态。
 *
 * 用户插话零包装，纯文本原话与带附件的内容块数组原样进上下文与落盘，
 * 界面显示同一份内容，与 pi 对用户消息的处理一致。
 * 包装方案评估后随标记系统搁置，详见设计文档注入文本形态一节的演进记录。
 * App 通知沿用既有前缀机制，直发、忙时注入与历史重放共用。
 */

import type { ContentBlock, PendingInput } from '@persona/shared';

/**
 * App 通知进入 Agent 上下文的文本形态。
 *
 * 存储层始终存通知原文加来源显示名，前缀只在进入上下文时拼接。
 *
 * @param source - App 显示名
 * @param content - 通知原文
 * @returns 带来源前缀的 user 消息文本
 */
export function formatAppNotificationForAgent(
  source: string,
  content: string
): string {
  return `[来自应用「${source}」的事件] ${content}`;
}

/**
 * 按来源分派待注入消息的上下文形态。
 *
 * @param input - 待注入消息
 * @returns 进入 Agent 上下文的 user 消息，user 来源透传原始内容，app 来源为带前缀文本
 */
export function formatPendingInputForAgent(
  input: PendingInput
): string | ContentBlock[] {
  if (input.source === 'app') {
    // App 通知恒为纯文本，类型收窄守卫
    const content = typeof input.content === 'string' ? input.content : '';
    return formatAppNotificationForAgent(
      input.sourceName ?? input.source,
      content
    );
  }
  return input.content;
}
