/**
 * @fileoverview Shared utilities for router handlers.
 */

import type { Request, Response, RequestHandler } from 'express';
import multer from 'multer';
import { Logger } from '../../util/logger.js';
import { errorMessage, AppError } from '../../util/errors.js';

/** 图片上传共用的 MIME 白名单 */
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
]);

/**
 * 图片上传共用的 multer 实例。
 *
 * - 限制单文件 5MB
 * - 仅放行白名单内 MIME，其余以 400 拒绝
 */
export const imageUpload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(400, `Unsupported image format: ${file.mimetype}`));
    }
  },
});

/** Helper to extract string param from Express req.params */
export function getParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 包装路由处理函数，统一捕获异常并格式化错误响应。
 *
 * - `AppError`（业务错误）使用其自带的 statusCode，4xx 不记日志、5xx 记日志。
 * - 其他异常统一返回 500 并记录日志。
 *
 * asyncHandler 自行捕获并响应，不依赖全局 error middleware，
 * 因此在测试中单独挂载 router 也能正常工作。
 *
 * @param category - Logger 日志分类标签
 * @param message - 错误描述
 * @param handler - 实际业务逻辑函数
 * @returns 可直接传给 router.get() / router.post() 等的处理函数
 */
export function asyncHandler(
  category: string,
  message: string,
  handler: (req: Request, res: Response) => void | Promise<void>
): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof AppError) {
        Logger.log(category, message, error);
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      Logger.log(category, message, error);
      res.status(500).json({ error: errorMessage(error) });
    }
  };
}

/**
 * 校验必填参数。缺失时抛出 `AppError(400)`，存在时返回收窄后的 string。
 *
 * 使用方式：`const id = requireParam(getParam(req.params['id']), 'Agent ID');`
 *
 * @param value - 参数值
 * @param name - 参数显示名称（用于错误消息）
 * @returns 收窄为 string 类型的参数值
 * @throws {AppError} 参数缺失时抛出 400
 */
export function requireParam(value: string | undefined, name: string): string {
  if (!value) throw new AppError(400, `${name} is required`);
  return value;
}
