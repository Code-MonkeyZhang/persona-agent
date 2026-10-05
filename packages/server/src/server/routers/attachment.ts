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
import { asyncHandler, getParam, ALLOWED_IMAGE_MIME_TYPES } from './utils.js';
import { ALLOWED_AUDIO_MIME } from './voice.js';

/** 哈希地址的合法形状，64 位小写十六进制，防路径穿越 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** 附件白名单为图片与音频合集，聊天附件当前就这两类 */
const ALLOWED_ATTACHMENT_MIME = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_AUDIO_MIME,
]);

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported attachment format: ${file.mimetype}`));
    }
  },
});

export function createAttachmentRouter(): Router {
  const router = Router();

  /**
   * POST /api/attachments - Upload an attachment stored by content hash
   *
   * 接收 multipart/form-data 中的单个文件，按内容哈希落盘登记，
   * 重复内容命中去重返回同哈希。
   *
   * @returns JSON: `{ success, hash, format, size }`
   */
  router.post(
    '/',
    upload.single('file'),
    asyncHandler('ATTACHMENT', 'Error uploading attachment', (req, res) => {
      if (!req.file) throw new AppError(400, 'No file uploaded');
      const meta = saveAttachment(req.file.buffer, req.file.mimetype);
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
