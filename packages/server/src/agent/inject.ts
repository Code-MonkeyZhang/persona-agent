/**
 * @fileoverview 待注入消息进入 Agent 上下文的文本形态。
 *
 * 用户插话零包装，原话进上下文与落盘，界面显示同一份文本，
 * 与 pi 对用户消息的处理一致。包装方案评估后随标记系统搁置，
 * 详见设计文档注入文本形态一节的演进记录。
 * App 通知沿用既有前缀机制，直发、忙时注入与历史重放共用。
 */

import type { PendingInput } from '@persona/shared';

/**
 * App 通知进入 Agent 上下文的文本形态。
 *
 * 存储层始终存通知原文加来源名，前缀只在进入上下文时拼接。
 *
 * @param source - App 名称
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
 * 按来源分派待注入消息的上下文文本。
 *
 * @param input - 待注入消息
 * @returns 进入 Agent 上下文的 user 消息文本
 */
export function formatPendingInputForAgent(input: PendingInput): string {
  if (input.source === 'app') {
    return formatAppNotificationForAgent(
      input.sourceName ?? input.source,
      input.content
    );
  }
  return input.content;
}
