/**
 * @fileoverview HTTP routes for MCP management.
 *
 * Routes:
 * - GET  /api/mcp                        - List all MCP servers with status and tools
 * - GET  /api/mcp/:name                  - Get a single MCP server's status and tools
 * - POST /api/mcp/:name/oauth/authorize  - Start OAuth flow, returns authorization URL
 * - GET  /api/mcp/:name/oauth/status     - Poll OAuth flow status
 */

import { Router } from 'express';
import {
  listMcpServers,
  getMcpServer,
  startOAuthFlow,
  getOAuthStatus,
} from '../../mcp/index.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError, errorMessage } from '../../util/errors.js';

export function createMcpRouter(): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler('MCP', 'Error listing MCP servers', (_req, res) => {
      const servers = listMcpServers().map((s) => ({
        name: s.name,
        status: s.status,
        toolCount: s.tools.length,
        error: s.error,
        oauthUrl: s.oauthUrl,
      }));
      res.json({ servers });
    })
  );

  router.get(
    '/:name',
    asyncHandler('MCP', 'Error getting MCP server', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');

      const entry = getMcpServer(name);
      if (!entry) throw new AppError(404, 'MCP server not found');

      const server = {
        name: entry.name,
        status: entry.status,
        toolCount: entry.tools.length,
        error: entry.error,
        oauthUrl: entry.oauthUrl,
      };
      res.json({ server });
    })
  );

  router.post(
    '/:name/oauth/authorize',
    asyncHandler('MCP', 'Error starting OAuth flow', async (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');

      try {
        const result = await startOAuthFlow(name);
        res.json(result);
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes('not found')) {
          throw new AppError(404, message);
        }
        if (
          message.includes('cannot start OAuth') ||
          message.includes('already in progress')
        ) {
          throw new AppError(400, message);
        }
        throw error;
      }
    })
  );

  router.get(
    '/:name/oauth/status',
    asyncHandler('MCP', 'Error getting OAuth status', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');

      try {
        const status = getOAuthStatus(name);
        res.json(status);
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes('not found')) {
          throw new AppError(404, message);
        }
        throw error;
      }
    })
  );

  return router;
}
