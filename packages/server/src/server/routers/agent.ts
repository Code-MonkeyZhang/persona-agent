/**
 * @fileoverview HTTP routes for agent management.
 *
 * Routes:
 * - GET    /api/agents              - List all agents
 * - GET    /api/agents/seed-status  - Initial agent seed status
 * - POST   /api/agents/seed-status/onboarded - Mark first-run onboarding done
 * - GET    /api/agents/:id          - Get single agent
 * - POST   /api/agents              - Create agent
 * - PUT    /api/agents/:id          - Update agent
 * - DELETE /api/agents/:id          - Delete agent
 * - GET    /api/agents/:id/memory           - List memory entries
 * - POST   /api/agents/:id/memory           - Create memory entry
 * - PUT    /api/agents/:id/memory/:uid      - Update memory entry
 * - DELETE /api/agents/:id/memory/:uid      - Delete memory entry
 */

import { Router } from 'express';
import {
  listAgentsWithHashes,
  withAvatarHash,
  getAgentConfig,
  createAgentConfig,
  updateAgentConfig,
  deleteAgentConfig,
  readAgentSeedStatus,
  markSeedOnboarded,
  AgentConfigInputSchema,
  AgentConfigUpdateSchema,
} from '../../agent/index.js';
import { SessionStore } from '../../session/store.js';
import { SessionManager } from '../../session/session-manager.js';
import { MemoryStore } from '../../agent/memory/memory-store.js';
import {
  MemoryUpdateInputSchema,
  MemoryWriteInputSchema,
} from '@persona/shared';
import { Logger } from '../../util/logger.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';

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
      const agents = listAgentsWithHashes();
      res.json({ agents });
    })
  );

  /** GET /api/agents/seed-status - 初始 Agent 播种状态（读取失败返回 seeded: false） */
  router.get(
    '/seed-status',
    asyncHandler('AGENT', 'Error getting seed status', (_req, res) => {
      res.json(readAgentSeedStatus());
    })
  );

  /** POST /api/agents/seed-status/onboarded - 标记首启引导完成，幂等，返回最新状态 */
  router.post(
    '/seed-status/onboarded',
    asyncHandler('AGENT', 'Error marking onboarded', (_req, res) => {
      res.json(markSeedOnboarded());
    })
  );

  /** GET /api/agents/:id - Get a single agent config by ID */
  router.get(
    '/:id',
    asyncHandler('AGENT', 'Error getting agent', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');

      const agent = getAgentConfig(id);
      if (!agent) throw new AppError(404, 'Agent not found');

      res.json({ agent: withAvatarHash(agent) });
    })
  );

  /** POST /api/agents - Create a new agent config */
  router.post(
    '/',
    asyncHandler('AGENT', 'Error creating agent', (req, res) => {
      const result = AgentConfigInputSchema.safeParse(req.body);
      if (!result.success)
        throw new AppError(400, JSON.stringify(result.error.issues));

      const agent = createAgentConfig(result.data);

      // register new agent in SessionManager map
      if (sessionManagers) {
        registerSessionManager(agent.id, sessionManagers);
      }

      Logger.log('AGENT', `Created agent: ${agent.id}`);
      res.status(201).json({ agent: withAvatarHash(agent) });
    })
  );

  /** PUT /api/agents/:id - Update an existing agent config */
  router.put(
    '/:id',
    asyncHandler('AGENT', 'Error updating agent', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');

      const existing = getAgentConfig(id);
      if (!existing) throw new AppError(404, 'Agent not found');

      const result = AgentConfigUpdateSchema.safeParse(req.body);
      if (!result.success)
        throw new AppError(400, JSON.stringify(result.error.issues));

      const agent = updateAgentConfig(id, result.data);
      Logger.log('AGENT', `Updated agent: ${id}`);
      res.json({ agent: withAvatarHash(agent) });
    })
  );

  /** DELETE /api/agents/:id - Delete an agent config */
  router.delete(
    '/:id',
    asyncHandler('AGENT', 'Error deleting agent', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');

      const existing = getAgentConfig(id);
      if (!existing) throw new AppError(404, 'Agent not found');

      deleteAgentConfig(id);

      if (sessionManagers) {
        // 删 agent 目录不再连带清会话，这里显式删掉该 agent 的全部会话行
        const manager = sessionManagers.get(id);
        if (manager) {
          for (const meta of manager.listSessions()) {
            manager.deleteSession(meta.id);
          }
        }
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

  /** GET /api/agents/:id/memory - 记忆条目全量列表，编号升序含停用 */
  router.get(
    '/:id/memory',
    asyncHandler('AGENT', 'Error listing memory entries', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');
      if (!getAgentConfig(id)) throw new AppError(404, 'Agent not found');
      res.json({ entries: new MemoryStore(id).listEntries() });
    })
  );

  /** POST /api/agents/:id/memory - 用户新增，不查重想记重复随他 */
  router.post(
    '/:id/memory',
    asyncHandler('AGENT', 'Error creating memory entry', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');
      if (!getAgentConfig(id)) throw new AppError(404, 'Agent not found');
      const parsed = MemoryWriteInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, JSON.stringify(parsed.error.issues));
      const result = new MemoryStore(id).writeEntry(parsed.data, {
        skipDedup: true,
      });
      if (!result.ok)
        throw new AppError(
          400,
          result.kind === 'invalid' ? result.message : ''
        );
      Logger.log('AGENT', 'Memory created', {
        agentId: id,
        uid: result.entry.uid,
      });
      res.status(201).json({ entry: result.entry });
    })
  );

  /** PUT /api/agents/:id/memory/:uid - 用户更新，keys 与查重校验同工具通道 */
  router.put(
    '/:id/memory/:uid',
    asyncHandler('AGENT', 'Error updating memory entry', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');
      if (!getAgentConfig(id)) throw new AppError(404, 'Agent not found');
      const uid = Number(req.params['uid']);
      if (!Number.isInteger(uid) || uid <= 0)
        throw new AppError(400, 'uid must be a positive integer');
      const parsed = MemoryUpdateInputSchema.safeParse(req.body);
      if (!parsed.success)
        throw new AppError(400, JSON.stringify(parsed.error.issues));
      const result = new MemoryStore(id).updateEntry(uid, parsed.data);
      if (!result.ok) {
        if (result.kind === 'notFound')
          throw new AppError(404, 'Memory entry not found');
        throw new AppError(
          400,
          result.kind === 'invalid' ? result.message : 'duplicate content'
        );
      }
      Logger.log('AGENT', 'Memory updated', { agentId: id, uid });
      res.json({ entry: result.entry });
    })
  );

  /** DELETE /api/agents/:id/memory/:uid - 用户删除，遗忘当场生效 */
  router.delete(
    '/:id/memory/:uid',
    asyncHandler('AGENT', 'Error deleting memory entry', (req, res) => {
      const id = requireParam(getParam(req.params['id']), 'Agent ID');
      if (!getAgentConfig(id)) throw new AppError(404, 'Agent not found');
      const uid = Number(req.params['uid']);
      if (!Number.isInteger(uid) || uid <= 0)
        throw new AppError(400, 'uid must be a positive integer');
      const store = new MemoryStore(id);
      if (!store.listEntries().some((entry) => entry.uid === uid)) {
        throw new AppError(404, 'Memory entry not found');
      }
      store.forgetEntry(uid);
      Logger.log('AGENT', 'Memory deleted', { agentId: id, uid });
      res.json({ success: true });
    })
  );

  return router;
}
