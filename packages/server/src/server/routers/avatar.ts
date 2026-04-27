/**
 * @fileoverview HTTP routes for agent avatar management.
 *
 * Routes:
 * - GET  /api/agents/:agentId/avatar - Get avatar image
 * - POST /api/agents/:agentId/avatar - Upload avatar image
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentAssetsDir } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';
import { getParam } from './utils.js';
import { processAvatar } from '../../lib/avatar-processor.js';

const AVATAR_FILENAME = 'avatar.png';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif']);

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image format: ${file.mimetype}`));
    }
  },
});

function getAvatarPath(agentId: string): string {
  return path.join(getAgentAssetsDir(agentId), AVATAR_FILENAME);
}

/**
 * 创建 Agent 头像路由。
 *
 * 挂载到 `/api/agents/:agentId/avatar` 路径下，
 * 提供 GET（获取头像图片）和 POST（上传头像图片）两个接口。
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
  router.get('/', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }

      const avatarPath = getAvatarPath(agentId);
      if (!fs.existsSync(avatarPath)) {
        res.status(404).json({ error: 'Avatar not found' });
        return;
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(avatarPath).pipe(res);
    } catch (error) {
      Logger.log('AVATAR', 'Error getting avatar', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST / — 上传 Agent 头像图片。
   *
   * 接收 multipart/form-data 中的图片文件（5MB 上限），
   * 用 jimp 裁剪缩放为 256x256 PNG 后写入 assets/avatar.png。
   *
   * @returns JSON: `{ success: true }`
   */
  router.post(
    '/',
    upload.single('avatar'),
    async (req: Request, res: Response) => {
      try {
        const agentId = getParam(req.params['agentId']);
        if (!agentId) {
          res.status(400).json({ error: 'Agent ID is required' });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const assetsDir = getAgentAssetsDir(agentId);
        if (!fs.existsSync(assetsDir)) {
          fs.mkdirSync(assetsDir, { recursive: true });
        }

        const processed = await processAvatar(req.file.buffer);
        fs.writeFileSync(getAvatarPath(agentId), processed);

        Logger.log('AVATAR', `Uploaded avatar for agent: ${agentId}`);
        res.json({ success: true });
      } catch (error) {
        Logger.log('AVATAR', 'Error uploading avatar', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  return router;
}
