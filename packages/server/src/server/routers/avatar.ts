/**
 * @fileoverview HTTP routes for agent avatar management.
 *
 * Routes:
 * - GET  /api/agents/:agentId/avatar - Get avatar image
 * - POST /api/agents/:agentId/avatar - Upload avatar image
 */

import { Router } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentAssetsDir } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';
import { asyncHandler, getParam, requireParam, imageUpload } from './utils.js';
import { AppError } from '../../util/errors.js';
import { processAvatar } from '../../lib/avatar-processor.js';

const AVATAR_FILENAME = 'avatar.png';

function getAvatarPath(agentId: string): string {
  return path.join(getAgentAssetsDir(agentId), AVATAR_FILENAME);
}

/**
 * 创建 Agent 头像路由。
 *
 * 挂载到 `/api/agents/:agentId/avatar` 路径下，
 * 提供 GET 和 POST 两个接口。
 *
 * @returns 配置好 GET/POST 路由的 Express Router
 */
export function createAvatarRouter(): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET / — 获取 Agent 头像图片。
   *
   * 从 Agent 的 assets 目录读取 avatar.png 并以流式响应返回。
   *
   * @returns PNG 图片流，或 404/400 错误 JSON
   */
  router.get(
    '/',
    asyncHandler('AVATAR', 'Error getting avatar', (req, res) => {
      const agentId = requireParam(getParam(req.params['agentId']), 'Agent ID');

      const avatarPath = getAvatarPath(agentId);
      if (!fs.existsSync(avatarPath)) {
        throw new AppError(404, 'Avatar not found');
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(avatarPath).pipe(res);
    })
  );

  /**
   * POST / — 上传 Agent 头像图片。
   *
   * 接收 multipart/form-data 中的图片文件，
   * 用 jimp 裁剪缩放为 256x256 PNG 后写入 assets/avatar.png。
   *
   * @returns JSON: `{ success: true }`
   */
  router.post(
    '/',
    imageUpload.single('avatar'),
    asyncHandler('AVATAR', 'Error uploading avatar', async (req, res) => {
      const agentId = requireParam(getParam(req.params['agentId']), 'Agent ID');

      if (!req.file) throw new AppError(400, 'No file uploaded');

      const assetsDir = getAgentAssetsDir(agentId);
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }

      const processed = await processAvatar(req.file.buffer);
      fs.writeFileSync(getAvatarPath(agentId), processed);

      Logger.log('AVATAR', `Uploaded avatar for agent: ${agentId}`);
      res.json({ success: true });
    })
  );

  return router;
}
