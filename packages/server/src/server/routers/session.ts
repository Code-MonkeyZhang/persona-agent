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
import type { Request, Response } from 'express';
import { SessionManager } from '../../session/index.js';
import { Logger } from '../../util/logger.js';
import type { SessionManagersMap } from './agent.js';
import { asyncHandler, getParam, requireParam } from './utils.js';

export function createSessionRouter(
  sessionManagers: SessionManagersMap
): Router {
  const router = Router({ mergeParams: true });

  /** Helper to get manager for the current route */
  function getSessionManager(
    req: Request,
    res: Response
  ): SessionManager | null {
    const agentId = getParam(req.params['agentId']);
    if (!requireParam(agentId, 'Agent ID', res)) return null;
    const manager = sessionManagers.get(agentId);
    if (!manager) {
      res
        .status(404)
        .json({ error: `Session manager not found for agent: ${agentId}` });
      return null;
    }
    return manager;
  }

  /** GET /api/agents/:agentId/sessions - List all sessions */
  router.get(
    '/',
    asyncHandler('SESSION', 'Error listing sessions', (req, res) => {
      const manager = getSessionManager(req, res);
      if (!manager) return;
      const sessions = manager.listSessions();
      res.json({ sessions });
    })
  );

  /** POST /api/agents/:agentId/sessions - Create a new session */
  router.post(
    '/',
    asyncHandler('SESSION', 'Error creating session', (req, res) => {
      const manager = getSessionManager(req, res);
      if (!manager) return;
      const agentId = getParam(req.params['agentId']);
      if (!requireParam(agentId, 'Agent ID', res)) return;
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
      const manager = getSessionManager(req, res);
      if (!manager) return;
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Session ID', res)) return;
      const session = manager.getSession(id);

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ session });
    })
  );

  /** PUT /api/agents/:agentId/sessions/:id - Update a session */
  router.put(
    '/:id',
    asyncHandler('SESSION', 'Error updating session', (req, res) => {
      const manager = getSessionManager(req, res);
      if (!manager) return;
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Session ID', res)) return;
      const { workspacePath, title, model } = req.body;

      let session = manager.getSession(id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // 聊天 Session 不允许改标题（workspace 和 model 修改不拦截）
      if (title !== undefined && id.startsWith('chat')) {
        res.status(403).json({ error: 'Cannot rename chat session' });
        return;
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
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }

      res.json({ session });
    })
  );

  /** DELETE /api/agents/:agentId/sessions/:id - Delete a session */
  router.delete(
    '/:id',
    asyncHandler('SESSION', 'Error deleting session', (req, res) => {
      const manager = getSessionManager(req, res);
      if (!manager) return;
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Session ID', res)) return;

      // 聊天 Session 不允许删除
      if (id.startsWith('chat')) {
        res.status(403).json({ error: 'Cannot delete chat session' });
        return;
      }

      const deleted = manager.deleteSession(id);

      if (!deleted) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      Logger.log('SESSION', `Deleted session: ${id}`);
      res.json({ success: true });
    })
  );

  return router;
}
