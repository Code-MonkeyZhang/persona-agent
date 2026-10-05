/**
 * @fileoverview HTTP routes for full sync.
 *
 * Routes:
 * - GET /api/sync/snapshot - Full mirror for cold-start clients
 */

import { Router } from 'express';
import { buildSnapshot } from '../../sync/sync-service.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler } from './utils.js';

export function createSyncRouter(): Router {
  const router = Router();

  /**
   * GET /api/sync/snapshot - Full mirror for cold-start clients
   *
   * 构建代价随库增长，日志记录会话数与耗时便于排查慢查询。
   *
   * @returns JSON: `{ snapshot }`
   */
  router.get(
    '/snapshot',
    asyncHandler('SYNC', 'Error building snapshot', (_req, res) => {
      const started = Date.now();
      const snapshot = buildSnapshot();
      const messageCount = snapshot.sessions.reduce(
        (sum, session) => sum + session.messages.length,
        0
      );
      Logger.log(
        'SYNC',
        `Built snapshot: ${snapshot.sessions.length} sessions ${messageCount} messages latestSeq=${snapshot.latestSeq} in ${Date.now() - started}ms`
      );
      res.json({ snapshot });
    })
  );

  return router;
}
