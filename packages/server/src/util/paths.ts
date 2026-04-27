/**
 * @fileoverview Application path utilities for animus-agent.
 *
 * Directory structure (macOS: ~/.local/share/animus-agent/, Windows: %APPDATA%/animus-agent/):
 * ├── config/
 * │   ├── config.yaml
 * │   └── auth.json
 * ├── agents/
 * │   └── {agentId}/
 * │       ├── config.json
 * │       ├── assets/
 * │       │   ├── avatar.png
 * │       │   ├── voice.aac
 * │       │   ├── pose/
 * │       │   └── backgrounds/
 * │       ├── sessions/
 * │       │   ├── index.json
 * │       │   └── {sessionId}.json
 * │       └── memory/
 * ├── skills/
 * │   └── {skillName}/
 * │       └── SKILL.md
 * ├── mcp/
 * │   ├── mcp.json
 * │   └── servers/
 * ├── workspace/
 * └── logs/
 */

import * as path from 'node:path';
import { xdgData } from 'xdg-basedir';

if (!xdgData) {
  throw new Error('Unable to determine XDG data directory');
}

const APP_DIR = path.join(xdgData, 'animus-agent');

// --- Top-level directories ---

export const getConfigDir = () => path.join(APP_DIR, 'config');
export const getAgentsDir = () => path.join(APP_DIR, 'agents');
export const getSkillsDir = () => path.join(APP_DIR, 'skills');
export const getMcpDir = () => path.join(APP_DIR, 'mcp');
export const getMcpServersDir = () => path.join(getMcpDir(), 'servers');
export const getWorkspaceDir = () => path.join(APP_DIR, 'workspace');
export const getLogsDir = () => path.join(APP_DIR, 'logs');

// --- Config files ---

export const getConfigPath = () => path.join(getConfigDir(), 'config.yaml');
export const getAuthPath = () => path.join(getConfigDir(), 'auth.json');
export const getMcpConfigPath = () => path.join(getMcpDir(), 'mcp.json');

/**
 * Returns the path to the cloudflared binary.
 * Located in the same directory as the running server executable (via process.execPath).
 */
export const getCloudflaredBinPath = () =>
  path.join(path.dirname(process.execPath), 'cloudflared');

// --- Per-agent paths ---

export function getAgentDir(agentId: string): string {
  return path.join(getAgentsDir(), agentId);
}

export function getAgentConfigPath(agentId: string): string {
  return path.join(getAgentDir(agentId), 'config.json');
}

export function getAgentSessionsDir(agentId: string): string {
  return path.join(getAgentDir(agentId), 'sessions');
}

export function getAgentSessionIndexPath(agentId: string): string {
  return path.join(getAgentSessionsDir(agentId), 'index.json');
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
