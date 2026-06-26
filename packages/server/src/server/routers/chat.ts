/**
 * @fileoverview HTTP routes for chat operations.
 */

import { Router } from 'express';
import type { SessionManagersMap } from './agent.js';
import { processChat } from '../services/chat-service.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';

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
   *   - content: 用户消息内容 (字符串)
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
      // 验证接受的信息是字符串 TODO: 如果要支持多模态, 这个东西必须改掉
      if (!content || typeof content !== 'string') {
        throw new AppError(400, 'Content is required');
      }

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
        content,
        voiceEnabled: voiceEnabled === true,
        sessionManager,
      });

      if (!result.success) {
        throw new AppError(500, result.error ?? 'Chat failed');
      }

      res.json({ success: true });
    })
  );

  return router;
}
