/**
 * @fileoverview HTTP routes for device management.
 *
 * Routes:
 * - GET  /api/devices - List known devices with online flag
 */

import { Router } from 'express';
import { listDevices } from '../services/device-store.js';
import { getOnlineDevices } from '../websocket-server.js';
import { asyncHandler } from './utils.js';

export function createDeviceRouter(): Router {
  const router = Router();

  /** GET /api/devices - List known devices with online flag */
  router.get(
    '/',
    asyncHandler('DEVICE', 'Error listing devices', (_req, res) => {
      const onlineIds = new Set(
        getOnlineDevices().map((device) => device.deviceId)
      );
      res.json({ devices: listDevices(onlineIds) });
    })
  );

  return router;
}
