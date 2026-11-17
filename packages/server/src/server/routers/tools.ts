/**
 * @fileoverview HTTP routes for the tool registry.
 *
 * Routes:
 * - GET  /api/tools              - Registry entries with per-agent assignment flags
 * - POST /api/tools/assignment   - Assign or unassign one entry for an agent
 */

import { Router } from 'express';
import {
  toolRegistry,
  effectiveToolNames,
  hasPoseAssets,
  pickDisplayText,
  POSE_TOOLSET_ID,
  type DisplayLang,
} from '../../tools/index.js';
import { getAgentConfig, updateAgentConfig } from '../../agent/index.js';
import { asyncHandler, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';
import { Logger } from '../../util/logger.js';

export function createToolsRouter(): Router {
  const router = Router();

  /**
   * GET / - 注册表条目投影。
   *
   * 带 agentId 时每条附 assigned 标记，默认规则只在服务端算，
   * 客户端不派生，立绘条目按资产可见性过滤，注入与展示同源。
   * lang 决定显示文案取英文覆盖还是中文基底，服务端不记语言状态每次现挑。
   */
  router.get(
    '/',
    asyncHandler('TOOLS', 'Error listing tool entries', (req, res) => {
      const rawAgentId = req.query['agentId'];
      const agentId =
        typeof rawAgentId === 'string' && rawAgentId ? rawAgentId : undefined;
      const lang: DisplayLang = req.query['lang'] === 'en' ? 'en' : 'zh-CN';

      let assignment: Set<string> | null = null;
      if (agentId !== undefined) {
        const agent = getAgentConfig(agentId);
        if (!agent) throw new AppError(404, 'Agent not found');
        assignment = new Set(effectiveToolNames(agent));
      }
      const poseVisible = agentId === undefined || hasPoseAssets(agentId);

      const tools = toolRegistry
        .snapshot()
        .filter((entry) => entry.id !== POSE_TOOLSET_ID || poseVisible)
        .map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          name: pickDisplayText(entry.name, entry.nameEn, lang),
          description: pickDisplayText(
            entry.description,
            entry.descriptionEn,
            lang
          ),
          status: entry.status,
          functions: entry.functions.map((fn) => ({
            name: fn.name,
            shortName: fn.shortName,
            description: pickDisplayText(
              fn.description,
              fn.descriptionEn,
              lang
            ),
          })),
          url: entry.meta?.url,
          logoUrl: entry.meta?.logoUrl,
          instructions: pickDisplayText(
            entry.meta?.instructions,
            entry.meta?.instructionsEn,
            lang
          ),
          author: entry.meta?.author,
          error: entry.meta?.error,
          oauthUrl: entry.meta?.oauthUrl,
          assigned: assignment ? assignment.has(entry.id) : undefined,
        }));

      res.json({ tools });
    })
  );

  /**
   * POST /assignment - 写一条分配记录。
   *
   * assigned true 加条目 false 去条目，服务端算 effective 增删后落盘，
   * 写路径同时刷新 agents_invalidated 与 tools_invalidated。
   */
  router.post(
    '/assignment',
    asyncHandler(
      'TOOLS',
      'Error updating tool assignment',
      async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const agentId = requireParam(
          typeof body['agentId'] === 'string' ? body['agentId'] : undefined,
          'Agent ID'
        );
        const entryId = requireParam(
          typeof body['entryId'] === 'string' ? body['entryId'] : undefined,
          'Entry ID'
        );
        const assigned = body['assigned'] === true;

        const agent = getAgentConfig(agentId);
        if (!agent) throw new AppError(404, 'Agent not found');
        if (!toolRegistry.get(entryId)) {
          throw new AppError(404, `Tool entry not found: ${entryId}`);
        }

        const current = effectiveToolNames(agent);
        const next = assigned
          ? current.includes(entryId)
            ? current
            : [...current, entryId]
          : current.filter((id) => id !== entryId);

        const updated = updateAgentConfig(agentId, { toolNames: next });
        Logger.log(
          'TOOLS',
          `Assignment '${entryId}' ${assigned ? 'on' : 'off'} for agent '${agentId}'`
        );
        res.json({ toolNames: updated.toolNames ?? [] });
      }
    )
  );

  return router;
}
