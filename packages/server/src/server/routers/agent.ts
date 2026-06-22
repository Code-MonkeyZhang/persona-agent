/**
 * @fileoverview HTTP routes for agent management.
 *
 * Routes:
 * - GET    /api/agents     - List all agents
 * - GET    /api/agents/:id - Get single agent
 * - POST   /api/agents     - Create agent
 * - PUT    /api/agents/:id - Update agent
 * - DELETE /api/agents/:id - Delete agent
 */

import { Router } from 'express';
import {
  listAgentConfigs,
  getAgentConfig,
  createAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  AgentConfigInputSchema,
} from '../../agent/index.js';
import { SessionStore } from '../../session/store.js';
import { SessionManager } from '../../session/session-manager.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler, getParam, requireParam } from './utils.js';

export type SessionManagersMap = Map<string, SessionManager>;

export function createAgentRouter(
  sessionManagers?: SessionManagersMap
): Router {
  const router = Router();

  /** GET /api/agents - List all agent configs */
  router.get(
    '/',
    asyncHandler('AGENT', 'Error listing agents', (_req, res) => {
      const agents = listAgentConfigs();
      res.json({ agents });
    })
  );

  /** GET /api/agents/:id - Get a single agent config by ID */
  router.get(
    '/:id',
    asyncHandler('AGENT', 'Error getting agent', (req, res) => {
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Agent ID', res)) return;

      const agent = getAgentConfig(id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      res.json({ agent });
    })
  );

  /** POST /api/agents - Create a new agent config */
  router.post(
    '/',
    asyncHandler('AGENT', 'Error creating agent', (req, res) => {
      const result = AgentConfigInputSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: result.error.issues });
        return;
      }

      const agent = createAgentConfig(result.data);

      // register new agent in SessionManager map
      if (sessionManagers) {
        const sessionStore = new SessionStore(agent.id);
        const sessionManager = new SessionManager(sessionStore, agent.id);
        sessionManagers.set(agent.id, sessionManager);

        // 自动创建聊天 Session
        sessionManager.createChatSession();
      }

      Logger.log('AGENT', `Created agent: ${agent.id}`);
      res.status(201).json({ agent });
    })
  );

  /** PUT /api/agents/:id - Update an existing agent config */
  router.put(
    '/:id',
    asyncHandler('AGENT', 'Error updating agent', (req, res) => {
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Agent ID', res)) return;

      const existing = getAgentConfig(id);
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      const result = AgentConfigInputSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: result.error.issues });
        return;
      }

      const agent = updateAgentConfig(id, result.data);
      Logger.log('AGENT', `Updated agent: ${id}`);
      res.json({ agent });
    })
  );

  /** DELETE /api/agents/:id - Delete an agent config */
  router.delete(
    '/:id',
    asyncHandler('AGENT', 'Error deleting agent', (req, res) => {
      const id = getParam(req.params['id']);
      if (!requireParam(id, 'Agent ID', res)) return;

      const existing = getAgentConfig(id);
      if (!existing) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }

      deleteAgentConfig(id);

      if (sessionManagers) {
        sessionManagers.delete(id);
        Logger.log(
          'SERVER',
          `Removed session manager for deleted agent: ${id}`
        );
      }

      Logger.log('AGENT', `Deleted agent: ${id}`);
      res.json({ success: true });
    })
  );

  return router;
}
