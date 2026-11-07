/**
 * @fileoverview HTTP routes for chat attachments.
 *
 * Routes:
 * - POST /api/attachments       - Upload an attachment stored by content hash
 * - GET  /api/attachments/:hash - Download an attachment with immutable caching
 */

import { Router } from 'express';
import multer from 'multer';
import * as fs from 'node:fs';
import { saveAttachment, getAttachment } from '../services/attachment-store.js';
import { AppError } from '../../util/errors.js';
import { asyncHandler, getParam } from './utils.js';

/** 哈希地址的合法形状，64 位小写十六进制，防路径穿越 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * 附件上传只守二十兆上限，类型不设白名单，图片与文件同构收留。
 * defParamCharset 指定 utf8，Chromium 与 fetch 的中文文件名按 UTF-8 解码。
 */
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 },
  defParamCharset: 'utf8',
});

export function createAttachmentRouter(): Router {
  const router = Router();

  /**
   * POST /api/attachments - Upload an attachment stored by content hash
   *
   * 接收 multipart/form-data 中的单个文件，任意类型放行，
   * 按内容哈希落盘登记，重复内容命中去重返回同哈希。
   *
   * @returns JSON: `{ success, hash, format, size, name }`
   */
  router.post(
    '/',
    upload.single('file'),
    asyncHandler('ATTACHMENT', 'Error uploading attachment', (req, res) => {
      if (!req.file) throw new AppError(400, 'No file uploaded');
      const meta = saveAttachment(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );
      res.json({ success: true, ...meta });
    })
  );

  /**
   * GET /api/attachments/:hash - Download an attachment with immutable caching
   *
   * 地址即内容哈希，地址变化就是内容变化，响应可无限期缓存。
   *
   * @returns Binary file body
   */
  router.get(
    '/:hash',
    asyncHandler('ATTACHMENT', 'Error downloading attachment', (req, res) => {
      const hash = getParam(req.params['hash']);
      if (!hash || !HASH_PATTERN.test(hash)) {
        throw new AppError(404, 'Attachment not found');
      }
      const attachment = getAttachment(hash);
      if (!attachment) throw new AppError(404, 'Attachment not found');
      res.setHeader('Content-Type', attachment.format);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(fs.readFileSync(attachment.filePath));
    })
  );

  return router;
}
