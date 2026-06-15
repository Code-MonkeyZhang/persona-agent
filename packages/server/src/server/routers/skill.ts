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
      const name = getParam(req.params['name']);
      if (!requireParam(name, 'Skill name', res)) return;

      const skill = getSkill(name);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      res.json({ skill });
    })
  );

  return router;
}
