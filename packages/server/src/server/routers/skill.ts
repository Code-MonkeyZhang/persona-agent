/**
 * @fileoverview HTTP routes for skill management.
 *
 * Routes:
 * - GET /api/skills        - List all available skills (name + description only)
 * - GET /api/skills/:name  - Get single skill with full content
 * - GET /api/skills/:name/logo - Get the skill's local marketplace logo
 */

import { Router } from 'express';
import { listSkills, getSkill, toSkillDetail } from '../../skill/index.js';
import { isSafeSkillName } from '../../marketplace/util.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';
import { Logger } from '../../util/logger.js';
import { getFileHash } from '../../util/asset-hash.js';
import { resolveLocalLogoFile, sendLocalLogo } from '../../util/local-logo.js';

export function createSkillRouter(): Router {
  const router = Router();

  /** GET /api/skills - List all available skills */
  router.get(
    '/',
    asyncHandler('SKILL', 'Error listing skills', (_req, res) => {
      const skills = listSkills();
      res.json({ skills });
    })
  );

  /** GET /api/skills/:name - Get a single skill by name */
  router.get(
    '/:name',
    asyncHandler('SKILL', 'Error getting skill', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Skill name');

      const skill = getSkill(name);
      if (!skill) throw new AppError(404, 'Skill not found');

      res.json({ skill: toSkillDetail(skill) });
    })
  );

  /**
   * GET /api/skills/:name/logo - 取已安装技能的本地图标。
   *
   * 文件名只来自安装 meta 的解析结果，不来自请求参数。目录经 getSkill
   * 解析，文件夹名与 frontmatter 名不同的技能也能命中。
   */
  router.get(
    '/:name/logo',
    asyncHandler('SKILL', 'Error getting skill logo', (req, res) => {
      const name = requireParam(getParam(req.params['name']), 'Skill name');
      if (!isSafeSkillName(name)) {
        throw new AppError(400, 'Invalid skill name');
      }

      const skill = getSkill(name);
      const logoPath = skill && resolveLocalLogoFile(skill.skillDir, skill);
      if (!logoPath) {
        throw new AppError(404, 'Skill logo not found');
      }

      Logger.log(
        'SKILL',
        `Serving local logo for '${name}', hash: ${getFileHash(logoPath)}`
      );
      sendLocalLogo(res, logoPath, typeof req.query['h'] === 'string');
    })
  );

  return router;
}
