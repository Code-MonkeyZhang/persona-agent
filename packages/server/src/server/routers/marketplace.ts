/**
 * @fileoverview Marketplace 路由 —— 从 GitHub 仓库读清单、下载安装、卸载。
 *
 * Routes:
 * - GET    /api/marketplace/skills              - 拉取 Skill 清单（浏览）
 * - POST   /api/marketplace/skills/:name/install - 下载安装（重名 409 / 找不到 404 / 坏文件 500）
 * - DELETE /api/marketplace/skills/:name         - 卸载（删文件夹）
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler, getParam } from './utils.js';
import { fetchManifest } from '../../marketplace/manifest.js';
import { downloadSkill } from '../../marketplace/downloader.js';
import { isSafeSkillName, folderNameOf } from '../../marketplace/util.js';
import { getSkillsDir } from '../../util/paths.js';
import { getSkill, hasSkill } from '../../skill/index.js';
import { Logger } from '../../util/logger.js';

export function createMarketplaceRouter(): Router {
  const router = Router();

  /** GET /api/marketplace/skills - 拉取 Skill 清单（后端代理，绕开前端 CORS） */
  router.get(
    '/skills',
    asyncHandler(
      'MARKETPLACE',
      'Error listing marketplace skills',
      async (_req, res) => {
        const skills = await fetchManifest();
        res.json({ skills });
      }
    )
  );

  /**
   * POST /api/marketplace/skills/:name/install
   * 后端只管"下载到全局 skills 目录"，不关心分配给哪个 Agent；
   * 分配由前端装成功后调 updateAgentSkillNames 自己做（见阶段 4）。
   *
   * 状态码：400 名字非法 / 409 已装过 / 404 清单无此条目 / 500 下载失败或 SKILL.md 无法解析。
   */
  router.post('/skills/:name/install', async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        res.status(400).json({ error: 'Invalid skill name' });
        return;
      }

      // 重名拒绝：hasSkill 按名懒加载，能发现已存在的（含手建的）
      if (hasSkill(name)) {
        res.status(409).json({
          error: `Skill "${name}" already installed, please uninstall first`,
        });
        return;
      }

      // 重拉清单，按文件夹名找到条目
      const manifest = await fetchManifest();
      const entry = manifest.find((e) => folderNameOf(e) === name);
      if (!entry) {
        res
          .status(404)
          .json({ error: `Skill "${name}" not found in marketplace` });
        return;
      }

      // 下载（含路径安全 + 下载失败回滚）
      const skillDir = await downloadSkill(entry);

      // 入池：listSkills 不扫目录，必须主动按名加载一次，否则商城"已安装"状态对不上。
      // 若 getSkill 返回 undefined，说明下载下来的 SKILL.md 无法解析（作者写错）——回滚并报错。
      const loaded = getSkill(name);
      if (!loaded) {
        fs.rmSync(skillDir, { recursive: true });
        res
          .status(500)
          .json({ error: '下载的 SKILL.md 无法解析，请向作者反馈' });
        return;
      }

      res.json({ success: true, name });
    } catch (error) {
      Logger.log('MARKETPLACE', 'Error installing skill', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/marketplace/skills/:name
   * 删除本地 skill 文件夹；池子在下次访问时自动移除该条目（pool.ts 的 stat 失败 catch 分支）。
   */
  router.delete('/skills/:name', async (req: Request, res: Response) => {
    try {
      const name = getParam(req.params['name']);
      if (!name || !isSafeSkillName(name)) {
        res.status(400).json({ error: 'Invalid skill name' });
        return;
      }

      const skillDir = path.join(getSkillsDir(), name);
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true });
      }
      res.json({ success: true, name });
    } catch (error) {
      Logger.log('MARKETPLACE', 'Error uninstalling skill', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  });

  return router;
}
