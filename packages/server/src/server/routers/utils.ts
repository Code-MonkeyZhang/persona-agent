/**
 * @fileoverview Shared utilities for router handlers.
 */

import type { Request, Response } from 'express';
import { Logger } from '../../util/logger.js';
import { errorMessage } from '../../util/errors.js';

/** Helper to extract string param from Express req.params */
export function getParam(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 包装路由处理函数，统一处理 try/catch、日志记录和 500 错误响应。
 *
 * 替代每个 handler 中手写的 `try { ... } catch (error) { Logger.log(...); res.status(500).json(...) }` 样板。
 *
 * @param category - Logger 日志分类标签（如 'AGENT'、'SESSION'）
 * @param message - 错误描述（如 'Error listing agents'）
 * @param handler - 实际业务逻辑函数
 * @returns 可直接传给 router.get() / router.post() 等的处理函数
 */
export function asyncHandler(
  category: string,
  message: string,
  handler: (req: Request, res: Response) => void | Promise<void>
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      Logger.log(category, message, error);
      res.status(500).json({ error: errorMessage(error) });
    }
  };
}

/**
 * 检查必填参数是否存在。不存在时自动发送 400 响应。
 *
 * 使用方式：`if (!requireParam(id, 'Agent ID', res)) return;`
 * 返回 true 时 TypeScript 会将 value 收窄为 string 类型。
 *
 * @param value - 参数值
 * @param name - 参数显示名称（如 'Agent ID'）
 * @param res - Express 响应对象
 * @returns true 表示参数存在，false 表示已发送 400 响应
 */
export function requireParam(
  value: string | undefined,
  name: string,
  res: Response
): value is string {
  if (!value) {
    res.status(400).json({ error: `${name} is required` });
    return false;
  }
  return true;
}
