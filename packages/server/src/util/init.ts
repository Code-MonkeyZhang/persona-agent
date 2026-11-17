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
 * │   ├── servers/
 * │   └── run/
 * ├── attachments/
 * ├── wallpapers/
 * ├── workspace/
 * └── logs/
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { xdgData } from 'xdg-basedir';
import {
  getAgentsDir,
  getAttachmentsDir,
  getConfigDir,
  getConfigPath,
  getAuthPath,
  getLogsDir,
  getMcpConfigPath,
  getMcpDir,
  getMcpRunDir,
  getMcpServersDir,
  getSkillsDir,
  getWallpapersDir,
  getWorkspaceDir,
  getTtsConfigPath,
} from './paths.js';
import { Logger } from './logger.js';
import { getDefaultConfigYaml } from '../config.js';

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
  getAttachmentsDir,
  getWallpapersDir,
  getWorkspaceDir,
  getLogsDir,
  getSkillsDir,
  getMcpDir,
  getMcpServersDir,
  getMcpRunDir,
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
      '{\n  "model": "speech-2.8-hd",\n  "clonedVoices": [],\n  "summaryThreshold": 200\n}\n',
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

/** 手工日期备份的文件名前缀，启动清理的目标 */
const LEGACY_BACKUP_PREFIX = 'mcp.json.bak-';

/**
 * 清理 mcp 目录的手工残留并把运行期账本归位。
 * 日期备份、backups 目录与 .DS_Store 没有任何代码读写，删掉即净，
 * 旧位置的 pid 账本迁进 run 目录，迁移与删除逐项留日志。
 */
export function pruneMcpLeftovers(): void {
  const mcpDir = getMcpDir();
  const runDir = getMcpRunDir();
  const legacyLedger = path.join(mcpDir, 'app-pids.json');
  const ledger = path.join(runDir, 'app-pids.json');
  if (fs.existsSync(legacyLedger) && !fs.existsSync(ledger)) {
    fs.renameSync(legacyLedger, ledger);
    Logger.log('INIT', 'Migrated legacy app pid ledger into run directory');
  }
  const removed: string[] = [];
  for (const name of fs.existsSync(mcpDir) ? fs.readdirSync(mcpDir) : []) {
    const target = path.join(mcpDir, name);
    if (
      name.startsWith(LEGACY_BACKUP_PREFIX) ||
      name === 'backups' ||
      name === '.DS_Store'
    ) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(name);
    }
  }
  if (removed.length > 0) {
    Logger.log('INIT', 'Pruned manual leftovers in mcp directory', {
      removed,
    });
  }
}
