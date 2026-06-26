/**
 * @fileoverview HTTP routes for skill management.
 *
 * Routes:
 * - GET /api/skills     - List all available skills (name + description only)
 * - GET /api/skills/:name - Get single skill with full content
 */

import { Router } from 'express';
import { listSkills, getSkill } from '../../skill/index.js';
import { asyncHandler, getParam, requireParam } from './utils.js';
import { AppError } from '../../util/errors.js';

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

      res.json({ skill });
    })
  );

  return router;
}
