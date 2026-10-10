/**
 * @fileoverview Application path utilities for persona-agent.
 *
 * Directory structure (macOS: ~/.local/share/persona-agent/, Windows: %APPDATA%/persona-agent/):
 * ├── persona.db              # Single source-of-truth SQLite database
 * ├── config/
 * │   ├── config.yaml
 * │   ├── auth.json
 * │   └── minimax-tts.json
 * ├── agents/
 * │   └── {agentId}/
 * │       ├── config.json
 * │       ├── systemPrompt.md
 * │       ├── assets/
 * │       │   ├── avatar.png
 * │       │   ├── voice.aac
 * │       │   ├── pose/
 * │       │   └── backgrounds/
 * │       └── memory/
 * ├── skills/
 * │   └── {skillName}/
 * │       └── SKILL.md
 * ├── mcp/
 * │   ├── mcp.json
 * │   └── servers/
 * ├── attachments/
 * ├── runtimes/
 * ├── workspace/
 * └── logs/
 */

import * as path from 'node:path';
import { xdgData } from 'xdg-basedir';

if (!xdgData) {
  throw new Error('Unable to determine XDG data directory');
}

const APP_DIR = path.join(xdgData, 'persona-agent');

// --- Top-level directories ---

export const getConfigDir = () => path.join(APP_DIR, 'config');
export const getAgentsDir = () => path.join(APP_DIR, 'agents');
export const getSkillsDir = () => path.join(APP_DIR, 'skills');
export const getMcpDir = () => path.join(APP_DIR, 'mcp');
export const getMcpServersDir = () => path.join(getMcpDir(), 'servers');
export const getRuntimesDir = () => path.join(APP_DIR, 'runtimes');
export const getWorkspaceDir = () => path.join(APP_DIR, 'workspace');
export const getLogsDir = () => path.join(APP_DIR, 'logs');

/**
 * 聊天附件目录，文件名即内容哈希，相同内容只存一份。
 */
export const getAttachmentsDir = () => path.join(APP_DIR, 'attachments');

/**
 * 唯一正本 SQLite 库的文件路径，会话与消息等结构化数据都在库里。
 */
export const getDbPath = () => path.join(APP_DIR, 'persona.db');

// --- Config files ---

export const getConfigPath = () => path.join(getConfigDir(), 'config.yaml');
export const getAuthPath = () => path.join(getConfigDir(), 'auth.json');
export const getTtsConfigPath = () =>
  path.join(getConfigDir(), 'minimax-tts.json');
export const getMcpConfigPath = () => path.join(getMcpDir(), 'mcp.json');
export const getOAuthTokensPath = () =>
  path.join(getMcpDir(), 'oauth-tokens.json');

/**
 * 初始 Agent 播种状态文件路径（config/agent-seed.json）。
 * 记录「播种发生过没有」的一次性事实，防删除后复活。
 */
export const getAgentSeedStatusPath = () =>
  path.join(getConfigDir(), 'agent-seed.json');

/**
 * Returns the path to the cloudflared binary.
 * - Priority: PERSONA_CLOUDFLARED_BIN_PATH env var (set by desktop main process)
 * - Fallback: same directory as the running server executable
 */
export const getCloudflaredBinPath = () => {
  const envPath = process.env['PERSONA_CLOUDFLARED_BIN_PATH'];
  if (envPath) return envPath;
  const binName =
    process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(path.dirname(process.execPath), binName);
};

/**
 * 应用内一键下载的 uv 二进制路径，runtimes/uv 或 runtimes/uv.exe。
 */
export const getUvBinPath = () =>
  path.join(getRuntimesDir(), process.platform === 'win32' ? 'uv.exe' : 'uv');

// --- Per-agent paths ---

export function getAgentDir(agentId: string): string {
  return path.join(getAgentsDir(), agentId);
}

export function getAgentConfigPath(agentId: string): string {
  return path.join(getAgentDir(agentId), 'config.json');
}

export function getAgentSystemPromptPath(agentId: string): string {
  return path.join(getAgentDir(agentId), 'systemPrompt.md');
}

export function getAgentAssetsDir(agentId: string): string {
  return path.join(getAgentDir(agentId), 'assets');
}

export function getAgentAvatarPath(agentId: string): string {
  return path.join(getAgentAssetsDir(agentId), 'avatar.png');
}

export function getAgentAssetsPoseDir(agentId: string): string {
  return path.join(getAgentAssetsDir(agentId), 'pose');
}

export function getAgentAssetsBackgroundsDir(agentId: string): string {
  return path.join(getAgentAssetsDir(agentId), 'backgrounds');
}

export function getAgentMemoryDir(agentId: string): string {
  return path.join(getAgentDir(agentId), 'memory');
}
