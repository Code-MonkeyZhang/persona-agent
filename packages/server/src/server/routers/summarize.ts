/**
 * @fileoverview HTTP route for summarizing assistant messages (TTS use case).
 *
 * POST /api/agents/:agentId/sessions/:sessionId/summarize
 *
 * The route retrieves the session's current model config, calls the LLM to
 * produce a spoken-friendly summary, and returns it to the caller.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import type { SessionManagersMap } from './agent.js';
import { summarizeText } from '../services/summarize-service.js';
import { Logger } from '../../util/logger.js';
import { getParam } from './utils.js';

export function createSummarizeRouter(
  sessionManagers: SessionManagersMap
): Router {
  const router = Router({ mergeParams: true });

  /**
   * POST /api/agents/:agentId/sessions/:sessionId/summarize
   *
   * Request body: { "text": "long assistant message..." }
   * Response:     { "success": true, "summary": "..." }
   *               { "success": false, "error": "..." }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      const sessionId = getParam(req.params['sessionId']);

      if (!agentId) {
        res.status(400).json({ success: false, error: 'Agent ID is required' });
        return;
      }
      if (!sessionId) {
        res
          .status(400)
          .json({ success: false, error: 'Session ID is required' });
        return;
      }

      const { text } = req.body as { text?: unknown };
      if (!text || typeof text !== 'string') {
        res.status(400).json({
          success: false,
          error: 'text is required and must be a string',
        });
        return;
      }

      const sessionManager = sessionManagers.get(agentId);
      if (!sessionManager) {
        res.status(404).json({
          success: false,
          error: `Session manager not found for agent: ${agentId}`,
        });
        return;
      }

      const session = sessionManager.getSession(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: `Session not found: ${sessionId}`,
        });
        return;
      }

      if (!session.model) {
        res.status(400).json({
          success: false,
          error: 'Session has no model configured',
        });
        return;
      }

      const summary = await summarizeText(
        text,
        session.model.provider,
        session.model.model
      );

      if (!summary) {
        res.status(500).json({
          success: false,
          error: 'Summarization failed',
        });
        return;
      }

      res.json({ success: true, summary });
    } catch (error) {
      Logger.log('SUMMARIZE', 'Error in summarize route', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
