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
  AgentConfigUpdateSchema,
} from '../../agent/index.js';
import { SessionStore } from '../../session/store.js';
import { SessionManager } from '../../session/session-manager.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler, getParam, requireParam } from './utils.js';

export type SessionManagersMap = Map<string, SessionManager>;

/**
 * 为新 Agent 注册 SessionManager 并创建初始聊天 Session。
 * @param agentId Agent ID
 * @param sessionManagers 全局 SessionManager 映射
 */
export function registerSessionManager(
  agentId: string,
  sessionManagers: SessionManagersMap
): void {
  const sessionStore = new SessionStore(agentId);
  const sessionManager = new SessionManager(sessionStore, agentId);
  sessionManagers.set(agentId, sessionManager);
  sessionManager.createChatSession();
}

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
        registerSessionManager(agent.id, sessionManagers);
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

      const result = AgentConfigUpdateSchema.safeParse(req.body);
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
