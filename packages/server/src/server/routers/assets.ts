/**
 * @fileoverview HTTP routes for agent assets (poses & backgrounds).
 *
 * Routes:
 * - GET    /api/agents/:agentId/assets/pose              - List all pose names
 * - GET    /api/agents/:agentId/assets/pose/:name         - Get a specific pose image
 * - POST   /api/agents/:agentId/assets/pose/:name         - Upload a pose image
 * - DELETE /api/agents/:agentId/assets/pose/:name         - Delete a pose image
 * - PUT    /api/agents/:agentId/assets/pose/:oldName/rename - Rename a pose image
 * - GET    /api/agents/:agentId/assets/background         - Get background image
 * - POST   /api/agents/:agentId/assets/background         - Upload background image
 * - DELETE /api/agents/:agentId/assets/background         - Delete background image
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getAgentAssetsPoseDir,
  getAgentAssetsBackgroundsDir,
} from '../../util/paths.js';
import { Logger } from '../../util/logger.js';
import { getParam } from './utils.js';

const IMAGE_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp)$/i;

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

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

/**
 * 根据 URL 中的 name 在 pose 目录中查找匹配的文件名（不含扩展名匹配）。
 * @returns 匹配到的完整文件名，未找到返回 undefined
 */
function findPoseFile(poseDir: string, name: string): string | undefined {
  if (!fs.existsSync(poseDir)) return undefined;
  return fs
    .readdirSync(poseDir)
    .find((f) => path.parse(f).name === name && IMAGE_EXTENSIONS.test(f));
}

/**
 * 创建 Agent 资源路由。
 *
 * 挂载到 `/api/agents/:agentId/assets` 路径下，提供立绘和背景图的读写接口。
 *
 * @returns 配置好路由的 Express Router
 */
export function createAssetsRouter(): Router {
  const router = Router({ mergeParams: true });

  /**
   * GET /pose — 列出指定 Agent 的所有立绘表情名称。
   *
   * 从 Agent 的 pose 目录读取图片文件，去掉扩展名后作为表情名称返回。
   *
   * @returns JSON: `{ poses: string[] }`
   */
  router.get('/pose', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }

      const poseDir = getAgentAssetsPoseDir(agentId);
      if (!fs.existsSync(poseDir)) {
        res.json({ poses: [] });
        return;
      }

      const poses = fs
        .readdirSync(poseDir)
        .filter((f) => IMAGE_EXTENSIONS.test(f))
        .map((f) => path.parse(f).name);

      res.json({ poses });
    } catch (error) {
      Logger.log('ASSETS', 'Error listing poses', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /pose/:name — 获取指定名称的立绘图片文件。
   *
   * 根据 URL 中的 name 参数在 pose 目录中匹配文件名（不含扩展名），
   * 找到后以流式响应返回图片，自动设置对应的 Content-Type。
   *
   * @returns 图片文件流，或 404/400/500 错误 JSON
   */
  router.get('/pose/:name', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      const poseName = getParam(req.params['name']);
      if (!agentId || !poseName) {
        res.status(400).json({ error: 'Agent ID and pose name are required' });
        return;
      }

      const poseDir = getAgentAssetsPoseDir(agentId);
      const matched = findPoseFile(poseDir, poseName);

      if (!matched) {
        res.status(404).json({ error: `Pose not found: ${poseName}` });
        return;
      }

      const filePath = path.join(poseDir, matched);
      const ext = path.extname(matched).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      Logger.log('ASSETS', 'Error getting pose', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /pose/:name — 上传立绘图片。
   *
   * 以 URL 中的 name 作为文件名（扩展名取自上传文件），保存到 pose 目录。
   * 同名文件已存在时覆盖。
   *
   * @returns JSON: `{ success: true }`
   */
  router.post(
    '/pose/:name',
    upload.single('pose'),
    (req: Request, res: Response) => {
      try {
        const agentId = getParam(req.params['agentId']);
        const poseName = getParam(req.params['name']);
        if (!agentId || !poseName) {
          res
            .status(400)
            .json({ error: 'Agent ID and pose name are required' });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: 'No file uploaded' });
          return;
        }

        const poseDir = getAgentAssetsPoseDir(agentId);
        if (!fs.existsSync(poseDir)) {
          fs.mkdirSync(poseDir, { recursive: true });
        }

        const ext = path.extname(req.file.originalname) || '.png';
        const filePath = path.join(poseDir, `${poseName}${ext}`);
        fs.writeFileSync(filePath, req.file.buffer);

        Logger.log(
          'ASSETS',
          `Uploaded pose "${poseName}" for agent: ${agentId}`
        );
        res.json({ success: true });
      } catch (error) {
        Logger.log('ASSETS', 'Error uploading pose', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /pose/:name — 删除指定名称的立绘图片。
   *
   * 在 pose 目录中查找匹配的文件（忽略扩展名）并删除。
   *
   * @returns JSON: `{ success: true }`
   */
  router.delete('/pose/:name', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      const poseName = getParam(req.params['name']);
      if (!agentId || !poseName) {
        res.status(400).json({ error: 'Agent ID and pose name are required' });
        return;
      }

      const poseDir = getAgentAssetsPoseDir(agentId);
      const matched = findPoseFile(poseDir, poseName);

      if (!matched) {
        res.status(404).json({ error: `Pose not found: ${poseName}` });
        return;
      }

      fs.unlinkSync(path.join(poseDir, matched));

      Logger.log('ASSETS', `Deleted pose "${poseName}" for agent: ${agentId}`);
      res.json({ success: true });
    } catch (error) {
      Logger.log('ASSETS', 'Error deleting pose', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PUT /pose/:oldName/rename — 重命名立绘图片。
   *
   * 请求体 `{ name: "新名称" }`，保留原扩展名执行 fs.rename。
   * 比重新上传更轻量。
   *
   * @returns JSON: `{ success: true }`
   */
  router.put('/pose/:oldName/rename', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      const oldName = getParam(req.params['oldName']);
      const newName: string | undefined = req.body?.name;
      if (!agentId || !oldName || !newName) {
        res
          .status(400)
          .json({ error: 'Agent ID, old name, and new name are required' });
        return;
      }

      const poseDir = getAgentAssetsPoseDir(agentId);
      const matched = findPoseFile(poseDir, oldName);

      if (!matched) {
        res.status(404).json({ error: `Pose not found: ${oldName}` });
        return;
      }

      const ext = path.extname(matched);
      const oldPath = path.join(poseDir, matched);
      const newPath = path.join(poseDir, `${newName}${ext}`);
      fs.renameSync(oldPath, newPath);

      Logger.log(
        'ASSETS',
        `Renamed pose "${oldName}" to "${newName}" for agent: ${agentId}`
      );
      res.json({ success: true });
    } catch (error) {
      Logger.log('ASSETS', 'Error renaming pose', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /background — 获取指定 Agent 的背景图片。
   *
   * 从 Agent 的 backgrounds 目录中找到第一个图片文件并以流式响应返回。
   *
   * @returns 图片文件流，或 404/400/500 错误 JSON
   */
  router.get('/background', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }

      const bgDir = getAgentAssetsBackgroundsDir(agentId);
      if (!fs.existsSync(bgDir)) {
        res.status(404).json({ error: 'No background found' });
        return;
      }

      const files = fs.readdirSync(bgDir);
      const matched = files.find((f) => IMAGE_EXTENSIONS.test(f));

      if (!matched) {
        res.status(404).json({ error: 'No background found' });
        return;
      }

      const filePath = path.join(bgDir, matched);
      const ext = path.extname(matched).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      Logger.log('ASSETS', 'Error getting background', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /background — 上传背景图。
   *
   * 背景图只保留一张，上传前先清理目录中已有的图片文件。
   *
   * @returns JSON: `{ success: true }`
   */
  router.post(
    '/background',
    upload.single('background'),
    (req: Request, res: Response) => {
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

        const bgDir = getAgentAssetsBackgroundsDir(agentId);
        if (!fs.existsSync(bgDir)) {
          fs.mkdirSync(bgDir, { recursive: true });
        }

        // 清理已有的背景图文件
        for (const f of fs.readdirSync(bgDir)) {
          if (IMAGE_EXTENSIONS.test(f)) {
            fs.unlinkSync(path.join(bgDir, f));
          }
        }

        const ext = path.extname(req.file.originalname) || '.png';
        const filePath = path.join(bgDir, `background${ext}`);
        fs.writeFileSync(filePath, req.file.buffer);

        Logger.log('ASSETS', `Uploaded background for agent: ${agentId}`);
        res.json({ success: true });
      } catch (error) {
        Logger.log('ASSETS', 'Error uploading background', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * DELETE /background — 删除背景图。
   *
   * @returns JSON: `{ success: true }`
   */
  router.delete('/background', (req: Request, res: Response) => {
    try {
      const agentId = getParam(req.params['agentId']);
      if (!agentId) {
        res.status(400).json({ error: 'Agent ID is required' });
        return;
      }

      const bgDir = getAgentAssetsBackgroundsDir(agentId);
      if (!fs.existsSync(bgDir)) {
        res.status(404).json({ error: 'No background found' });
        return;
      }

      const matched = fs
        .readdirSync(bgDir)
        .find((f) => IMAGE_EXTENSIONS.test(f));
      if (!matched) {
        res.status(404).json({ error: 'No background found' });
        return;
      }

      fs.unlinkSync(path.join(bgDir, matched));

      Logger.log('ASSETS', `Deleted background for agent: ${agentId}`);
      res.json({ success: true });
    } catch (error) {
      Logger.log('ASSETS', 'Error deleting background', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
