/**
 * @fileoverview HTTP routes for session management.
 *
 * Routes:
 * - GET    /api/agents/:agentId/sessions     - List sessions
 * - POST   /api/agents/:agentId/sessions     - Create session
 * - GET    /api/agents/:agentId/sessions/:id - Get session
 * - PUT    /api/agents/:agentId/sessions/:id - Update session
 * - DELETE /api/agents/:agentId/sessions/:id - Delete session
 */

import { Router } from 'express';
import type { Request } from 'express';
import { SessionManager } from '../../session/index.js';
import { Logger } from '../../util/logger.js';
import type { SessionManagersMap } from './agent.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';

export function createSessionRouter(
  sessionManagers: SessionManagersMap
): Router {
  const router = Router({ mergeParams: true });

  /** Helper to get manager for the current route */
  function getSessionManager(req: Request): SessionManager {
    const agentId = requireParam(getParam(req.params['agentId']), 'Agent ID');
    const manager = sessionManagers.get(agentId);
    if (!manager) {
      throw new AppError(
        404,
        `Session manager not found for agent: ${agentId}`
      );
    }
    return manager;
  }

  /** GET /api/agents/:agentId/sessions - List all sessions */
  router.get(
    '/',
    asyncHandler('SESSION', 'Error listing sessions', (req, res) => {
      const manager = getSessionManager(req);
      const sessions = manager.listSessions();
      Logger.log(
        'SESSION',
        `Listed ${sessions.length} sessions (${sessions.filter((s) => s.lastMessage !== undefined).length} with preview)`
      );
      res.json({ sessions });
    })
  );

  /** POST /api/agents/:agentId/sessions - Create a new session */
  router.post(
    '/',
    asyncHandler('SESSION', 'Error creating session', (req, res) => {
      const manager = getSessionManager(req);
      const agentId = getParam(req.params['agentId'])!;
      const { title } = req.body;

      const session = manager.createSession({ title });

      Logger.log(
        'SESSION',
        `Created session: ${session.id} for agent: ${agentId}`
      );
      res.status(201).json({ session });
    })
  );

  /** GET /api/agents/:agentId/sessions/:id - Get a specific session */
  router.get(
    '/:id',
    asyncHandler('SESSION', 'Error getting session', (req, res) => {
      const manager = getSessionManager(req);
      const id = requireParam(getParam(req.params['id']), 'Session ID');
      const session = manager.getSession(id);

      if (!session) throw new AppError(404, 'Session not found');

      res.json({ session });
    })
  );

  /** PUT /api/agents/:agentId/sessions/:id - Update a session */
  router.put(
    '/:id',
    asyncHandler('SESSION', 'Error updating session', (req, res) => {
      const manager = getSessionManager(req);
      const id = requireParam(getParam(req.params['id']), 'Session ID');
      const { workspacePath, title, model } = req.body;

      let session = manager.getSession(id);
      if (!session) throw new AppError(404, 'Session not found');

      // 聊天 Session 不允许改标题
      if (title !== undefined && id.startsWith('chat')) {
        throw new AppError(403, 'Cannot rename chat session');
      }

      if (workspacePath !== undefined) {
        session = manager.updateWorkspacePath(id, workspacePath);
      }
      if (title !== undefined) {
        session = manager.updateTitle(id, title);
      }
      if (model !== undefined) {
        session = manager.updateModel(id, model);
      }

      if (
        workspacePath === undefined &&
        title === undefined &&
        model === undefined
      ) {
        throw new AppError(400, 'No valid fields to update');
      }

      res.json({ session });
    })
  );

  /** DELETE /api/agents/:agentId/sessions/:id - Delete a session */
  router.delete(
    '/:id',
    asyncHandler('SESSION', 'Error deleting session', (req, res) => {
      const manager = getSessionManager(req);
      const id = requireParam(getParam(req.params['id']), 'Session ID');

      // 聊天 Session 不允许删除
      if (id.startsWith('chat')) {
        throw new AppError(403, 'Cannot delete chat session');
      }

      const deleted = manager.deleteSession(id);

      if (!deleted) throw new AppError(404, 'Session not found');

      Logger.log('SESSION', `Deleted session: ${id}`);
      res.json({ success: true });
    })
  );

  return router;
}
