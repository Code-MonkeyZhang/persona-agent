/**
 * @fileoverview HTTP routes for MCP management.
 *
 * Routes:
 * - GET  /api/mcp                        - List all MCP servers with status and tools
 * - GET  /api/mcp/:name                  - Get a single MCP server's status and tools
 * - GET  /api/mcp/:name/logo             - Get the server's local marketplace logo
 * - POST /api/mcp/:name/reconnect        - Reconnect a failed server, in-flight guarded
 * - POST /api/mcp/:name/oauth/authorize  - Start OAuth flow, returns authorization URL
 * - GET  /api/mcp/:name/oauth/status     - Poll OAuth flow status
 */

import { Router } from 'express';
import * as path from 'node:path';
import {
  listMcpServers,
  getMcpServer,
  startOAuthFlow,
  getOAuthStatus,
  reconnectServer,
} from '../../mcp/index.js';
import { readMcpMeta } from '../../mcp/meta.js';
import { getMcpServersDir } from '../../util/paths.js';
import { isSafeSkillName } from '../../marketplace/util.js';
import { Logger } from '../../util/logger.js';
import { getFileHash } from '../../util/asset-hash.js';
import {
  produceLocalLogoUrl,
  resolveLocalLogoFile,
  sendLocalLogo,
} from '../../util/local-logo.js';
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
 * logoUrl 走本地图标产出链，本地文件缺失回退安装 meta 的远程网址。
 */
export function projectMcpServerEntry(entry: McpServerEntry) {
  return {
    name: entry.name,
    displayName: entry.meta?.displayName,
    description: entry.meta?.description ?? entry.config.description,
    author: entry.meta?.author,
    logoUrl: produceLocalLogoUrl(
      path.join(getMcpServersDir(), entry.name),
      entry.meta ?? {},
      `/api/mcp/${entry.name}/logo`,
      'MCP',
      entry.name
    ),
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

  /**
   * GET /:name/logo — 取已安装 MCP 的本地图标。
   *
   * 文件名只来自安装 meta 的解析结果，不来自请求参数。name 过安全
   * 校验后才拼服务目录，路径穿越进不来。
   */
  router.get(
    '/:name/logo',
    asyncHandler('MCP', 'Error getting MCP logo', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Server name');
      if (!isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid server name');
      }

      const meta = readMcpMeta(name) ?? {};
      const logoPath = resolveLocalLogoFile(
        path.join(getMcpServersDir(), name),
        meta
      );
      if (!logoPath) {
        throw new AppError(404, 'MCP logo not found');
      }

      Logger.log(
        'MCP',
        `Serving local logo for '${name}', hash: ${getFileHash(logoPath)}`
      );
      sendLocalLogo(res, logoPath, typeof req.query['h'] === 'string');
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
