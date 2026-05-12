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
import type { Request, Response } from 'express';
import {
  listMcpServers,
  getMcpServer,
  startOAuthFlow,
  getOAuthStatus,
} from '../../mcp/index.js';
import { Logger } from '../../util/logger.js';
import { getParam } from './utils.js';

export function createMcpRouter(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const servers = listMcpServers().map((s) => ({
        name: s.name,
        status: s.status,
        toolCount: s.tools.length,
        error: s.error,
        oauthUrl: s.oauthUrl,
      }));
      res.json({ servers });
    } catch (error) {
      Logger.log('MCP', 'Error listing MCP servers', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.get('/:name', (req: Request, res: Response) => {
    try {
      const name = getParam(req.params['name']);
      if (!name) {
        res.status(400).json({ error: 'Server name is required' });
        return;
      }

      const entry = getMcpServer(name);
      if (!entry) {
        res.status(404).json({ error: 'MCP server not found' });
        return;
      }

      const server = {
        name: entry.name,
        status: entry.status,
        toolCount: entry.tools.length,
        error: entry.error,
        oauthUrl: entry.oauthUrl,
      };
      res.json({ server });
    } catch (error) {
      Logger.log('MCP', 'Error getting MCP server', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/:name/oauth/authorize', async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params['name']);
      if (!name) {
        res.status(400).json({ error: 'Server name is required' });
        return;
      }

      const result = await startOAuthFlow(name);
      res.json(result);
    } catch (error) {
      Logger.log('MCP', 'Error starting OAuth flow', error);

      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      if (
        message.includes('cannot start OAuth') ||
        message.includes('already in progress')
      ) {
        res.status(400).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  });

  router.get('/:name/oauth/status', (req: Request, res: Response) => {
    try {
      const name = getParam(req.params['name']);
      if (!name) {
        res.status(400).json({ error: 'Server name is required' });
        return;
      }

      const status = getOAuthStatus(name);
      res.json(status);
    } catch (error) {
      Logger.log('MCP', 'Error getting OAuth status', error);

      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  });

  return router;
}
