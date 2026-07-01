/**
 * @fileoverview Application path utilities for persona-agent.
 *
 * Directory structure (macOS: ~/.local/share/persona-agent/, Windows: %APPDATA%/persona-agent/):
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
 * │       ├── sessions/
 * │       │   └── {sessionId}.jsonl
 * │       └── memory/
 * ├── skills/
 * │   └── {skillName}/
 * │       └── SKILL.md
 * ├── mcp/
 * │   ├── mcp.json
 * │   └── servers/
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

// --- Config files ---

export const getConfigPath = () => path.join(getConfigDir(), 'config.yaml');
export const getAuthPath = () => path.join(getConfigDir(), 'auth.json');
export const getTtsConfigPath = () =>
  path.join(getConfigDir(), 'minimax-tts.json');
export const getMcpConfigPath = () => path.join(getMcpDir(), 'mcp.json');
export const getOAuthTokensPath = () =>
  path.join(getMcpDir(), 'oauth-tokens.json');

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

export function getAgentSessionsDir(agentId: string): string {
  return path.join(getAgentDir(agentId), 'sessions');
}

export function getAgentAssetsDir(agentId: string): string {
  return path.join(getAgentDir(agentId), 'assets');
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
