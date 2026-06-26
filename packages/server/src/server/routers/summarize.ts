/**
 * @fileoverview HTTP route for summarizing assistant messages (TTS use case).
 *
 * POST /api/agents/:agentId/sessions/:sessionId/summarize
 *
 * The route retrieves the session's current model config, calls the LLM to
 * produce a spoken-friendly summary, and returns it to the caller.
 */

import { Router } from 'express';
import type { SessionManagersMap } from './agent.js';
import { summarizeText } from '../services/summarize-service.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';

export function createSummarizeRouter(
  sessionManagers: SessionManagersMap
): Router {
  const router = Router({ mergeParams: true });

  /**
   * POST /api/agents/:agentId/sessions/:sessionId/summarize
   *
   * Request body: { "text": "long assistant message..." }
   * Response:     { "summary": "..." }
   */
  router.post(
    '/',
    asyncHandler('SUMMARIZE', 'Error in summarize route', async (req, res) => {
      const agentId = requireParam(getParam(req.params['agentId']), 'Agent ID');
      const sessionId = requireParam(
        getParam(req.params['sessionId']),
        'Session ID'
      );

      const { text } = req.body as { text?: unknown };
      if (!text || typeof text !== 'string') {
        throw new AppError(400, 'text is required and must be a string');
      }

      const sessionManager = sessionManagers.get(agentId);
      if (!sessionManager) {
        throw new AppError(
          404,
          `Session manager not found for agent: ${agentId}`
        );
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        throw new AppError(404, `Session not found: ${sessionId}`);
      }

      if (!session.model) {
        throw new AppError(400, 'Session has no model configured');
      }

      const summary = await summarizeText(
        text,
        session.model.provider,
        session.model.model
      );

      if (!summary) {
        throw new AppError(500, 'Summarization failed');
      }

      res.json({ summary });
    })
  );

  return router;
}
