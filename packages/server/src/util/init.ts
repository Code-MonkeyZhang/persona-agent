/**
 * @fileoverview Application initialization utilities.
 * Creates required directories and config files on first run.
 *
 * Initialized directory structure (~/.local/share/persona-agent/ on macOS):
 * ~/.local/share/persona-agent/
 * ├── config/
 * │   ├── config.yaml
 * │   ├── auth.json
 * │   └── minimax-tts.json
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
import { xdgData } from 'xdg-basedir';
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
  getTtsConfigPath,
} from './paths.js';
import { getDefaultConfigYaml } from '../config/index.js';

/**
 * @deprecated Temporary migration function. Remove in next major version after all users have upgraded.
 * Migrates data directories from legacy names to the current `persona-agent` directory.
 * Migration chain: .nano-agent → animateclaw → animus-agent → persona-agent
 */
function migrateDataDir(): void {
  if (!xdgData) return;
  const newDir = path.join(xdgData, 'persona-agent');

  // animus-agent → persona-agent
  const oldDir = path.join(xdgData, 'animus-agent');
  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    fs.renameSync(oldDir, newDir);
  }

  // animateclaw → persona-agent (legacy chain)
  const ancientDir = path.join(xdgData, 'animateclaw');
  if (fs.existsSync(ancientDir) && !fs.existsSync(newDir)) {
    fs.renameSync(ancientDir, newDir);
  }

  // .nano-agent → persona-agent (legacy chain)
  const legacyDir = path.join(os.homedir(), '.nano-agent');
  if (fs.existsSync(legacyDir) && !fs.existsSync(newDir)) {
    fs.renameSync(legacyDir, newDir);
  }
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
  {
    getPath: getTtsConfigPath,
    getContent: () =>
      '{\n  "model": "speech-2.8-hd",\n  "clonedVoices": []\n}\n',
  },
];

/**
 * Initialize all required directories and config files.
 * Idempotent: existing items won't be overwritten.
 * Runs data directory migration before initialization.
 */
export function initAllDirsAndFiles(): void {
  migrateDataDir();

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
