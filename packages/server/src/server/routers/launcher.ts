/**
 * @fileoverview 小手机偏好的 HTTP 路由。
 *
 * Routes:
 * - PUT    /api/launcher/order                 - 提交排列文档
 * - PUT    /api/launcher/wallpaper             - 提交壁纸当前选择
 * - POST   /api/launcher/wallpaper/image       - 上传自定义壁纸，multipart 字段 image、thumb、name
 * - DELETE /api/launcher/wallpaper/image/:id   - 删除自定义壁纸条目与文件
 * - GET    /api/launcher/wallpaper/file/:hash  - 按内容哈希下载壁纸，immutable 强缓存
 */

import { Router } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import {
  putOrder,
  putWallpaperCurrent,
  addWallpaperImage,
  deleteWallpaperImage,
  getWallpaperFilePath,
} from '../services/launcher-store.js';
import { AppError } from '../../util/errors.js';
import { asyncHandler, getParam } from './utils.js';

/** 壁纸上传白名单，规范只收 JPEG 与 PNG */
const ALLOWED_WALLPAPER_MIME = new Set(['image/jpeg', 'image/png']);

/** 上传 multer 实例，传输层粗限 4MB，精确的 2MB 与尺寸校验在 store 层做 */
const upload = multer({
  limits: { fileSize: 4 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_WALLPAPER_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported image format: ${file.mimetype}`));
    }
  },
});

export function createLauncherRouter(): Router {
  const router = Router();

  /** PUT /api/launcher/order - 提交排列文档 */
  router.put(
    '/order',
    asyncHandler('LAUNCHER', 'Error saving launcher order', (req, res) => {
      const appOrder = (req.body as { appOrder?: unknown }).appOrder;
      if (!Array.isArray(appOrder)) {
        throw new AppError(400, 'appOrder must be an array');
      }
      res.json(putOrder(appOrder));
    })
  );

  /** PUT /api/launcher/wallpaper - 提交壁纸当前选择 */
  router.put(
    '/wallpaper',
    asyncHandler('LAUNCHER', 'Error saving wallpaper choice', (req, res) => {
      const currentId = (req.body as { currentId?: unknown }).currentId;
      if (currentId !== null && typeof currentId !== 'string') {
        throw new AppError(400, 'currentId must be a string or null');
      }
      res.json(putWallpaperCurrent(currentId));
    })
  );

  /** POST /api/launcher/wallpaper/image - 上传自定义壁纸 */
  router.post(
    '/wallpaper/image',
    upload.fields([
      { name: 'image', maxCount: 1 },
      { name: 'thumb', maxCount: 1 },
    ]),
    asyncHandler('LAUNCHER', 'Error uploading wallpaper', async (req, res) => {
      const files = req.files as
        | { image?: Express.Multer.File[]; thumb?: Express.Multer.File[] }
        | undefined;
      const image = files?.image?.[0];
      const thumb = files?.thumb?.[0];
      if (!image || !thumb) {
        throw new AppError(400, 'image and thumb files are required');
      }
      const name =
        typeof req.body['name'] === 'string' ? req.body['name'] : undefined;
      res.json(await addWallpaperImage(image.buffer, thumb.buffer, name));
    })
  );

  /** DELETE /api/launcher/wallpaper/image/:id - 删除自定义壁纸条目与文件 */
  router.delete(
    '/wallpaper/image/:id',
    asyncHandler('LAUNCHER', 'Error deleting wallpaper', (req, res) => {
      res.json(deleteWallpaperImage(getParam(req.params['id']) ?? ''));
    })
  );

  /** GET /api/launcher/wallpaper/file/:hash - 按内容哈希下载壁纸 */
  router.get(
    '/wallpaper/file/:hash',
    asyncHandler('LAUNCHER', 'Error downloading wallpaper', (req, res) => {
      const hash = getParam(req.params['hash']) ?? '';
      const filePath = getWallpaperFilePath(hash);
      if (!filePath) throw new AppError(404, 'Wallpaper not found');
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(filePath).pipe(res);
    })
  );

  return router;
}
