/**
 * @fileoverview Type definitions for the Skill system.
 */

import { z } from 'zod';

/**
 * Metadata schema for SKILL.md YAML frontmatter.
 */
export const SkillMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export type SkillMeta = z.infer<typeof SkillMetaSchema>;

/**
 * Represents a fully parsed skill from a SKILL.md file.
 */
export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
  /** Absolute path to the skill directory (parent of SKILL.md). */
  skillDir: string;
  mtime: number;
}

/**
 * Status of a skill reference in an agent config.
 */
export type SkillStatus = 'available' | 'unavailable';

/**
 * Skill info returned by list API (without full content).
 * 类型已迁移至 @persona/shared，此处再导出。
 */
export type { SkillInfo } from '@persona/shared';

/**
 * Skill status info for agent detail response.
 */
export interface SkillStatusInfo {
  name: string;
  description: string;
  status: SkillStatus;
}
