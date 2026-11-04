/**
 * @fileoverview HTTP routes for chat operations.
 */

import { Router } from 'express';
import type { SessionManagersMap } from './agent.js';
import { processChat } from '../services/chat-service.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';
import { getAttachment } from '../services/attachment-store.js';
import type { ContentBlock } from '@persona/shared';

/** 单条消息的图片与文件合计上限 */
const MAX_ATTACHMENTS_PER_MESSAGE = 20;

/** 附件哈希的合法形状，64 位小写十六进制 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * 校验聊天消息内容并收窄类型。
 *
 * 纯字符串与内容块数组两种形态放行：
 * - 文本块要求 text 为字符串
 * - 图片与文件块要求哈希为 64 位十六进制且已在附件仓登记，图片块的登记格式还须为图片
 * - 图片与文件合计不超过二十个
 *
 * @param content - 请求体里的 content 字段
 * @returns 收窄后的消息内容
 * @throws {AppError} 任一块不合法时抛 400，原因携带块下标
 */
export function validateChatContent(content: unknown): string | ContentBlock[] {
  if (typeof content === 'string') {
    if (!content) throw new AppError(400, 'Content is required');
    return content;
  }
  if (!Array.isArray(content) || content.length === 0) {
    throw new AppError(400, 'Content is required');
  }
  let attachments = 0;
  for (const [index, block] of content.entries()) {
    const b = block as Record<string, unknown>;
    if (b['type'] === 'text') {
      if (typeof b['text'] !== 'string') {
        throw new AppError(
          400,
          `Content block ${index}: text must be a string`
        );
      }
      continue;
    }
    if (b['type'] !== 'image' && b['type'] !== 'file') {
      throw new AppError(400, `Content block ${index}: unknown type`);
    }
    attachments += 1;
    if (attachments > MAX_ATTACHMENTS_PER_MESSAGE) {
      throw new AppError(
        400,
        `Too many attachments: limit is ${MAX_ATTACHMENTS_PER_MESSAGE}`
      );
    }
    const hash = b['hash'];
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
      throw new AppError(
        400,
        `Content block ${index}: invalid attachment hash`
      );
    }
    const attachment = getAttachment(hash);
    if (!attachment) {
      throw new AppError(
        400,
        `Content block ${index}: attachment not uploaded`
      );
    }
    if (b['type'] === 'image' && !attachment.format.startsWith('image/')) {
      throw new AppError(
        400,
        `Content block ${index}: attachment is not an image`
      );
    }
  }
  return content as ContentBlock[];
}

export function createChatRouter(sessionManagers: SessionManagersMap): Router {
  const router = Router({ mergeParams: true });

  /**
   * POST /api/agents/:agentId/sessions/:sessionId/chat
   *
   * 接口输入:
   * - 路径参数 (URL):
   *   - agentId: Agent 标识符
   *   - sessionId: Session标识符
   *
   * - 请求体 (JSON):
   *   - content: 用户消息内容，纯文本字符串或内容块数组
   *
   * 示例:
   * - URL: POST /api/agents/my-agent/sessions/session-123/chat
   * - Body: { "content": "你好，请帮我写一段代码" }
   */
  router.post(
    '/',
    asyncHandler('CHAT', 'Error processing chat', async (req, res) => {
      const agentId = requireParam(getParam(req.params['agentId']), 'Agent ID');
      const sessionId = requireParam(
        getParam(req.params['sessionId']),
        'Session ID'
      );

      const { content, voiceEnabled } = req.body as {
        content?: unknown;
        voiceEnabled?: unknown;
      };
      const validContent = validateChatContent(content);

      const sessionManager = sessionManagers.get(agentId);
      if (!sessionManager) {
        throw new AppError(
          404,
          `Session manager not found for agent: ${agentId}`
        );
      }

      const result = await processChat({
        agentId,
        sessionId,
        content: validContent,
        voiceEnabled: voiceEnabled === true,
        sessionManager,
      });

      if (!result.success) {
        throw new AppError(500, result.error ?? 'Chat failed');
      }

      // 透传 processChat 结果：忙时插话携带 pendingId
      res.json(result);
    })
  );

  return router;
}
