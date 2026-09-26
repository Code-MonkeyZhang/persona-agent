/** Skill info returned by GET /api/skills (without full content) */
export interface SkillInfo {
  name: string;
  description: string;
  /** Display name persisted at install time, absent for hand-created skills */
  displayName?: string;
  /** Author persisted at install time, absent for hand-created skills */
  author?: string;
  /** Absolute path of the skill directory */
  location: string;
}

/** Skill detail returned by GET /api/skills/:name, adds the full content on demand */
export interface SkillDetail extends SkillInfo {
  content: string;
}
