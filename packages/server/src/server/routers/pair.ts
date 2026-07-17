/**
 * @fileoverview HTTP route for mobile pairing.
 *
 * Route:
 * - POST /api/pair - Receive pair request from mobile, broadcast to desktop via WebSocket
 */

import { Router } from 'express';
import { broadcastToAll } from '../websocket-server.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler } from './utils.js';

export function createPairRouter(): Router {
  const router = Router();

  /**
   * POST /api/pair
   * 手机端扫码或手动输入后调用，服务端广播 pair_request 通知桌面端。
   */
  router.post(
    '/',
    asyncHandler('PAIR', 'Failed to handle /api/pair', async (req, res) => {
      const body = req.body as
        | {
            deviceName?: string;
            deviceId?: string;
            deviceType?: 'desktop' | 'mobile';
          }
        | undefined;

      const deviceName = body?.deviceName ?? 'Unknown';

      Logger.log('PAIR', `Received pair request from ${deviceName}`);

      broadcastToAll({
        type: 'pair_request',
        deviceName,
        deviceId: body?.deviceId,
        deviceType: body?.deviceType,
        timestamp: Date.now(),
      });

      res.json({ ok: true });
    })
  );

  return router;
}
