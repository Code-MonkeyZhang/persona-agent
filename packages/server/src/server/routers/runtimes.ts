/**
 * @fileoverview Runtime 管理路由 — uv 运行时状态查询与安装。
 *
 * Routes:
 * - GET  /api/runtimes            - 查询运行时状态
 * - POST /api/runtimes/uv/install - 一键安装 uv（含 Python 解释器）
 */

import { Router } from 'express';
import { asyncHandler } from './utils.js';
import { detectUv, installUv } from '../../util/uv-runtime.js';

export function createRuntimesRouter(): Router {
  const router = Router();

  /** GET /api/runtimes - 查询 uv 运行时状态 */
  router.get(
    '/',
    asyncHandler('RUNTIMES', 'Error listing runtimes', async (_req, res) => {
      res.json({ uv: await detectUv() });
    })
  );

  /** POST /api/runtimes/uv/install - 一键安装 uv（下载 + Python 解释器） */
  router.post(
    '/uv/install',
    asyncHandler('RUNTIMES', 'Error installing uv', async (_req, res) => {
      await installUv();
      res.json({ uv: await detectUv() });
    })
  );

  return router;
}
