/**
 * @fileoverview Runtime 管理路由 — 运行时状态查询与环境安装。
 *
 * Routes:
 * - GET  /api/runtimes            - 查询 uv 检测结果和安装状态
 * - POST /api/runtimes/uv/install - 发起环境安装，不等装完，进度经 WebSocket 推送
 */

import { Router } from 'express';
import { asyncHandler } from './utils.js';
import { detectUv } from '../../util/uv-runtime.js';
import {
  getRuntimeInstall,
  startRuntimeInstall,
} from '../services/runtime-install-service.js';

export function createRuntimesRouter(): Router {
  const router = Router();

  /** GET /api/runtimes - 查询 uv 检测结果，以及进行中或刚失败的那一次安装 */
  router.get(
    '/',
    asyncHandler('RUNTIMES', 'Error listing runtimes', async (_req, res) => {
      const uv = await detectUv();
      res.json({ uv, install: getRuntimeInstall() });
    })
  );

  /** POST /api/runtimes/uv/install - 发起环境安装，收到就返回 202，装完以后的结果靠推送 */
  router.post(
    '/uv/install',
    asyncHandler('RUNTIMES', 'Error installing runtime', async (_req, res) => {
      const install = startRuntimeInstall();
      const uv = await detectUv();
      res.status(202).json({ uv, install });
    })
  );

  return router;
}
