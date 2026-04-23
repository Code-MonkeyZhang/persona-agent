/**
 * @fileoverview Application initialization utilities.
 * Creates required directories and config files on first run.
 * Handles one-time migration from legacy ~/.nano-agent/ to the new XDG-based path.
 *
 * Initialized directory structure (~/.local/share/animateclaw/ on macOS):
 * ~/.local/share/animateclaw/
 * ├── config/
 * │   ├── config.yaml
 * │   └── auth.json
 * ├── agents/
 * ├── skills/
 * ├── mcp/
 * │   └── servers/
 * ├── workspace/
 * └── logs/
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getAgentsDir,
  getConfigDir,
  getConfigPath,
  getAuthPath,
  getLogsDir,
  getMcpConfigPath,
  getMcpDir,
  getMcpServersDir,
  getSkillsDir,
  getWorkspaceDir,
} from './paths.js';
import { getDefaultConfigYaml } from '../config/index.js';
import { Logger } from './logger.js';

/**
 * One-time migration from legacy ~/.nano-agent/ to the new XDG-based path.
 * Only runs when legacy dir exists and new dir has no data.
 * Legacy directory is preserved (not deleted) after migration.
 */
function migrateLegacyDataIfNeeded(newAppDir: string): void {
  const legacyDir = path.join(os.homedir(), '.nano-agent');
  if (!fs.existsSync(legacyDir)) return;
  if (fs.existsSync(newAppDir)) return;

  Logger.log('INIT', `Migrating data from ${legacyDir} to ${newAppDir}`);
  fs.cpSync(legacyDir, newAppDir, { recursive: true });
  Logger.log('INIT', 'Migration complete');
}

const REQUIRED_DIRS = [
  getConfigDir,
  getAgentsDir,
  getWorkspaceDir,
  getLogsDir,
  getSkillsDir,
  getMcpDir,
  getMcpServersDir,
];

const REQUIRED_FILES: Array<{
  getPath: () => string;
  getContent: () => string;
}> = [
  { getPath: getConfigPath, getContent: getDefaultConfigYaml },
  { getPath: getAuthPath, getContent: () => '{}\n' },
  { getPath: getMcpConfigPath, getContent: () => '{\n  "mcpServers": {}\n}\n' },
];

/**
 * Initialize all required directories and config files.
 * Idempotent: existing items won't be overwritten.
 */
export function initAllDirsAndFiles(): void {
  const appDir = path.dirname(getConfigDir());
  migrateLegacyDataIfNeeded(appDir);

  for (const getDir of REQUIRED_DIRS) {
    const dir = getDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  for (const file of REQUIRED_FILES) {
    const filePath = file.getPath();
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.getContent());
    }
  }
}
