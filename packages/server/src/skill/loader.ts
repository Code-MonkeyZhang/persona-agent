/**
 * @fileoverview Skill file loader and parser.
 *
 * Parses SKILL.md files with YAML frontmatter.
 * Format:
 * ```
 * ---
 * name: skill-name
 * description: Skill description
 * ---
 * Markdown content here...
 * ```
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../util/logger.js';
import { getSkillsDir } from '../util/paths.js';
import {
  SkillMetaSchema,
  type Skill,
  type SkillInfo,
  type SkillDetail,
} from './types.js';
import type { MarketplaceEntry } from '@persona/shared';

const SKILL_FILE_NAME = 'SKILL.md';
const FRONTMATTER_DELIMITER = '---';
export const SKILL_META_FILE_NAME = 'skill-meta.json';

/**
 * Parse YAML frontmatter from markdown content.
 *
 * @param content - Raw file content with potential frontmatter
 * @returns Tuple of [metadata object, remaining content] or null if invalid
 */
function parseFrontmatter(
  content: string
): [Record<string, unknown>, string] | null {
  if (!content.startsWith(FRONTMATTER_DELIMITER)) {
    return null;
  }

  const endIndex = content.indexOf(FRONTMATTER_DELIMITER, 3);
  if (endIndex === -1) {
    return null;
  }

  const yamlContent = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  const meta: Record<string, unknown> = {};
  for (const line of yamlContent.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    meta[key] = value;
  }

  return [meta, body];
}

/**
 * Load and parse a single SKILL.md file.
 *
 * @param filePath - Absolute path to the SKILL.md file
 * @returns Parsed Skill object or null if invalid
 */
export function loadSkillFile(filePath: string): Skill | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);

    if (!parsed) {
      Logger.log('SKILL', `Invalid frontmatter in: ${filePath}`);
      return null;
    }

    const [rawMeta, body] = parsed;
    const result = SkillMetaSchema.safeParse(rawMeta);

    if (!result.success) {
      Logger.log(
        'SKILL',
        `Invalid metadata in ${filePath}:`,
        result.error.issues
      );
      return null;
    }

    return {
      name: result.data.name,
      description: result.data.description ?? '',
      ...readSkillMeta(path.dirname(filePath)),
      content: body,
      filePath,
      skillDir: path.dirname(filePath),
      mtime: stat.mtimeMs,
    };
  } catch (error) {
    Logger.log('SKILL', `Failed to load skill file: ${filePath}`, error);
    return null;
  }
}

/**
 * Scan the skills directory and load all valid SKILL.md files.
 *
 * @returns Map of skill name to Skill object
 */
export function loadAllSkills(): Map<string, Skill> {
  const skillsDir = getSkillsDir();
  const skills = new Map<string, Skill>();

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
    return skills;
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(skillsDir, entry.name, SKILL_FILE_NAME);
    const skill = loadSkillFile(skillPath);

    if (skill) {
      if (skills.has(skill.name)) {
        Logger.log(
          'SKILL',
          `Duplicate skill name "${skill.name}", overwriting with ${skillPath}`
        );
      }
      skills.set(skill.name, skill);
    }
  }

  return skills;
}

/**
 * Convert a Skill to SkillInfo (for list API without full content).
 */
export function toSkillInfo(skill: Skill): SkillInfo {
  return {
    name: skill.name,
    description: skill.description,
    displayName: skill.displayName,
    author: skill.author,
    location: skill.skillDir,
  };
}

/**
 * Convert a Skill to SkillDetail, adding the full content for the single-skill API.
 */
export function toSkillDetail(skill: Skill): SkillDetail {
  return {
    ...toSkillInfo(skill),
    content: skill.content,
  };
}

/** Metadata keys kept in skill-meta.json, written by the marketplace installer. */
interface SkillMetaFile {
  displayName?: string;
  author?: string;
}

/**
 * Persist marketplace entry metadata beside SKILL.md so the display name and
 * author survive after the manifest entry is discarded.
 */
export function writeSkillMeta(destDir: string, entry: MarketplaceEntry): void {
  const meta = {
    displayName: entry.name,
    author: entry.author,
    homepage: entry.homepage,
  };
  fs.writeFileSync(
    path.join(destDir, SKILL_META_FILE_NAME),
    JSON.stringify(meta, null, 2)
  );
}

/**
 * Read optional install-time metadata placed beside SKILL.md.
 * Returns undefined when the file is missing or invalid, so the skill stays usable.
 */
function readSkillMeta(skillDir: string): SkillMetaFile | undefined {
  try {
    const metaPath = path.join(skillDir, SKILL_META_FILE_NAME);
    if (!fs.existsSync(metaPath)) return undefined;

    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const meta: SkillMetaFile = {};
    if (
      typeof raw['displayName'] === 'string' &&
      raw['displayName'].length > 0
    ) {
      meta.displayName = raw['displayName'];
    }
    if (typeof raw['author'] === 'string' && raw['author'].length > 0) {
      meta.author = raw['author'];
    }
    return meta;
  } catch (error) {
    Logger.log(
      'SKILL',
      `Failed to read skill metadata in ${skillDir}, skipping`,
      error
    );
    return undefined;
  }
}
