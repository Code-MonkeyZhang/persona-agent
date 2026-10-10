/**
 * @fileoverview HTTP route for the host handshake.
 *
 * Route: GET /api/handshake - Report host identity and server version.
 */

import { Router } from 'express';
import type { HandshakeInfo } from '@persona/shared';
import { APP_VERSION } from '../../util/app.js';
import { getHostIdentity } from '../host-identity.js';
import { asyncHandler } from './utils.js';

export function createHandshakeRouter(): Router {
  const router = Router();

  /**
   * GET /api/handshake - 客户端连接主机前取身份与版本。
   *
   * hostId 是主机身份，客户端凭它认旧主机；hostName 是自称名默认值，
   * 客户端改名只存本地不下发；version 供客户端做兼容性判断。
   */
  router.get(
    '/',
    asyncHandler('HANDSHAKE', 'Error building handshake', (_req, res) => {
      const identity = getHostIdentity();
      const payload: HandshakeInfo = {
        hostId: identity.hostId,
        hostName: identity.hostName,
        version: APP_VERSION,
      };
      res.json(payload);
    })
  );

  return router;
}
