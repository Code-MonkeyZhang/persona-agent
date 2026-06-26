/**
 * @fileoverview HTTP routes for Cloudflare Tunnel management.
 *
 * Routes:
 * - POST /api/tunnel/start  - Start the tunnel (async, returns 202 while starting)
 * - POST /api/tunnel/stop   - Stop the tunnel
 * - GET  /api/tunnel/status - Query current tunnel state
 */

import { Router } from 'express';
import { startTunnel, stopTunnel, getTunnelStatus } from '../tunnel-service.js';
import { httpServer } from '../index.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler } from './utils.js';
import { AppError } from '../../util/errors.js';

export function createTunnelRouter(): Router {
  const router = Router();

  /**
   * POST /api/tunnel/start
   * Start the cloudflared tunnel. Returns immediately with current status.
   */
  router.post(
    '/start',
    asyncHandler('TUNNEL', 'Failed to handle /start', async (_req, res) => {
      const current = getTunnelStatus();

      if (current.status === 'running') {
        res.json({ success: true, status: 'running', url: current.url });
        return;
      }

      if (current.status === 'starting') {
        res.status(202).json({ success: true, status: 'starting' });
        return;
      }

      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') {
        throw new AppError(500, 'Server is not listening');
      }

      // Fire-and-forget: startTunnel runs async, client polls /status
      void startTunnel(addr.port).catch((err: unknown) => {
        Logger.log('TUNNEL', 'Background start failed', err);
      });

      res.status(202).json({ success: true, status: 'starting' });
    })
  );

  /**
   * POST /api/tunnel/stop
   * Stop the running cloudflared tunnel.
   */
  router.post(
    '/stop',
    asyncHandler('TUNNEL', 'Failed to handle /stop', async (_req, res) => {
      await stopTunnel();
      res.json({ success: true });
    })
  );

  /**
   * GET /api/tunnel/status
   * Return the current tunnel state for client polling.
   */
  router.get('/status', (_req, res) => {
    const current = getTunnelStatus();
    res.json({
      success: true,
      status: current.status,
      url: current.url,
      error: current.error,
    });
  });

  return router;
}
