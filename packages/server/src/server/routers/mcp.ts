/**
 * @fileoverview HTTP routes for MCP management.
 *
 * Routes:
 * - GET  /api/mcp                        - List all MCP servers with status and tools
 * - GET  /api/mcp/:name                  - Get a single MCP server's status and tools
 * - POST /api/mcp/:name/reconnect        - Reconnect a failed server, in-flight guarded
 * - POST /api/mcp/:name/oauth/authorize  - Start OAuth flow, returns authorization URL
 * - GET  /api/mcp/:name/oauth/status     - Poll OAuth flow status
 */

import { Router } from 'express';
import {
  listMcpServers,
  getMcpServer,
  startOAuthFlow,
  getOAuthStatus,
  reconnectServer,
} from '../../mcp/index.js';
import type { McpConnectionType } from '@persona/shared';
import type { McpServerEntry } from '../../mcp/index.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError, errorMessage } from '../../util/errors.js';

/**
 * 由状态与配置推导连接类型。
 * 需要授权或已拿到授权地址判 oauth，配置带 url 判 http，其余为 stdio。
 */
function deriveConnectionType(entry: McpServerEntry): McpConnectionType {
  if (entry.status === 'needs_auth' || entry.oauthUrl) return 'oauth';
  return entry.config.url ? 'http' : 'stdio';
}

/**
 * 将 McpServerEntry 投影为 API 响应格式。
 * 详情页所需字段一次取齐，显示信息优先取安装 meta，缺省回退 config。
 */
export function projectMcpServerEntry(entry: McpServerEntry) {
  return {
    name: entry.name,
    displayName: entry.meta?.displayName,
    description: entry.meta?.description ?? entry.config.description,
    author: entry.meta?.author,
    logoUrl: entry.meta?.logoUrl,
    status: entry.status,
    toolCount: entry.tools.length,
    tools: entry.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
    instructions: entry.instructions,
    url: entry.config.url,
    connectionType: deriveConnectionType(entry),
    agentApp: entry.agentApp === true,
    supportedUI: entry.supportedUI,
    error: entry.error,
    oauthUrl: entry.oauthUrl,
  };
}

export function createMcpRouter(): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler('MCP', 'Error listing MCP servers', (_req, res) => {
      const servers = listMcpServers().map(projectMcpServerEntry);
      res.json({ servers });
    })
  );

  router.get(
    '/:name',
    asyncHandler('MCP', 'Error getting MCP server', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');

      const entry = getMcpServer(name);
      if (!entry) throw new AppError(404, 'MCP server not found');

      res.json({ server: projectMcpServerEntry(entry) });
    })
  );

  router.post(
    '/:name/reconnect',
    asyncHandler('MCP', 'Error reconnecting MCP server', async (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');

      try {
        await reconnectServer(name);
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes('not found')) {
          throw new AppError(404, message);
        }
        throw error;
      }

      const entry = getMcpServer(name);
      res.json({ server: entry ? projectMcpServerEntry(entry) : null });
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
