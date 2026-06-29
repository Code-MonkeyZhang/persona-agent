/**
 * @fileoverview Agent config storage module.
 *
 * Provides CRUD operations for agent configurations:
 * - Create: createAgentConfig()
 * - Read: getAgentConfig(), listAgentConfigs(), hasAgentConfig()
 * - Update: updateAgentConfig()
 * - Delete: deleteAgentConfig()
 *
 * Each agent is stored in its own directory:
 * agents/{agentId}/
 * ├── config.json
 * ├── systemPrompt.md
 * ├── assets/
 * │   ├── pose/
 * │   └── backgrounds/
 * ├── sessions/
 * └── memory/
 */

import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { readJsonFile } from '../util/fs-helpers.js';
import { Logger } from '../util/logger.js';
import {
  getAgentsDir,
  getAgentDir,
  getAgentConfigPath,
  getAgentSystemPromptPath,
  getAgentAssetsDir,
  getAgentAssetsPoseDir,
  getAgentAssetsBackgroundsDir,
  getAgentSessionsDir,
  getAgentMemoryDir,
} from '../util/paths.js';
import {
  AgentConfigSchema,
  type AgentConfig,
  type AgentConfigInput,
  type AgentConfigUpdate,
} from './types.js';

/** Atomic write to prevent data corruption */
function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

/** Serialize a value as JSON and write it atomically */
function writeJsonAtomic(filePath: string, data: unknown): void {
  writeFileAtomic(filePath, JSON.stringify(data, null, 2));
}

/**
 * Read an agent's system prompt from systemPrompt.md.
 * Returns undefined when the file does not exist.
 */
function readSystemPrompt(agentId: string): string | undefined {
  const filePath = getAgentSystemPromptPath(agentId);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, 'utf-8');
}

/** Write an agent's system prompt to systemPrompt.md atomically */
function writeSystemPrompt(agentId: string, content: string): void {
  writeFileAtomic(getAgentSystemPromptPath(agentId), content);
}

/** Check if an agent exists */
export function hasAgentConfig(id: string): boolean {
  return fs.existsSync(getAgentConfigPath(id));
}

/**
 * Get a single agent config by ID.
 * @param id - The unique identifier of the agent.
 * @returns The agent config object, or undefined if not found or invalid.
 */
export function getAgentConfig(id: string): AgentConfig | undefined {
  const onDisk = readJsonFile<Record<string, unknown> | null>(
    getAgentConfigPath(id),
    null
  );
  if (onDisk === null) return undefined;

  // systemPrompt 单独存于 systemPrompt.md；缺失时回退 config.json 残留值兼容旧数据
  const fromMd = readSystemPrompt(id);
  const fallback =
    typeof onDisk['systemPrompt'] === 'string'
      ? onDisk['systemPrompt']
      : undefined;
  const systemPrompt = fromMd ?? fallback;

  const result = AgentConfigSchema.safeParse({ ...onDisk, systemPrompt });
  return result.success ? result.data : undefined;
}

/**
 * List all agent configs.
 * @returns An array of all agent config objects.
 */
export function listAgentConfigs(): AgentConfig[] {
  const agentsDir = getAgentsDir();
  if (!fs.existsSync(agentsDir)) {
    return [];
  }
  const agents: AgentConfig[] = [];
  const entries = fs.readdirSync(agentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const config = getAgentConfig(entry.name);
    if (config) {
      agents.push(config);
    }
  }

  return agents;
}

/**
 * Generate a human-readable agent ID using short UUID + local time.
 *
 * Format: `xxxxxxxx-YYYYMMDD-HHmmss` (e.g. `a1b2c3d4-20260616-143000`).
 * The 8-char UUID prefix guarantees uniqueness; the timestamp suffix
 * makes the folder name identifiable at a glance.
 *
 * @param timestamp - Override the timestamp (used by migration). Defaults to now.
 */
function generateAgentId(timestamp: number = Date.now()): string {
  const now = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const shortId = randomUUID().slice(0, 8);
  return `${shortId}-${date}-${time}`;
}

/**
 * Create a new agent config.
 * Creates the directory structure:
 * agents/{agentId}/ with config.json, systemPrompt.md, assets/, assets/pose/,
 * assets/backgrounds/, sessions/, memory/
 *
 * @param input - Agent configuration input
 * @returns Created agent configuration
 */
export function createAgentConfig(input: AgentConfigInput): AgentConfig {
  const id = generateAgentId();
  const now = Date.now();

  const config: AgentConfig = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
  };

  const agentDir = getAgentDir(id);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }

  fs.mkdirSync(getAgentAssetsDir(id), { recursive: true });
  fs.mkdirSync(getAgentAssetsPoseDir(id), { recursive: true });
  fs.mkdirSync(getAgentAssetsBackgroundsDir(id), { recursive: true });
  fs.mkdirSync(getAgentSessionsDir(id), { recursive: true });
  fs.mkdirSync(getAgentMemoryDir(id), { recursive: true });

  // systemPrompt 单独写入 systemPrompt.md，config.json 不再包含该字段
  const { systemPrompt, ...onDisk } = config;
  writeJsonAtomic(getAgentConfigPath(id), onDisk);
  writeSystemPrompt(id, systemPrompt);

  Logger.log('AGENT', `Created agent config: ${id}`);
  return config;
}

/**
 * Update an existing agent config.
 *
 * 接受部分更新：传入对象中只需包含需要修改的字段，其余字段从现有配置继承。
 * id 与 createdAt 不可变，updatedAt 每次调用都会刷新。
 *
 * @param id - The unique identifier of the agent.
 * @param input - Partial agent config fields to update.
 * @returns The updated agent config object.
 * @throws {Error} If the agent does not exist.
 */
export function updateAgentConfig(
  id: string,
  input: AgentConfigUpdate
): AgentConfig {
  const existing = getAgentConfig(id);
  if (!existing) {
    throw new Error(`Agent not found: ${id}`);
  }

  const updated: AgentConfig = {
    ...existing,
    ...input,
    id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  // systemPrompt 单独持久化；config.json 不再包含该字段
  const { systemPrompt, ...onDisk } = updated;
  writeJsonAtomic(getAgentConfigPath(id), onDisk);
  if (input.systemPrompt !== undefined) {
    writeSystemPrompt(id, systemPrompt);
  }

  Logger.log('AGENT', `Updated agent config: ${id}`);
  return updated;
}

/** Delete an agent and all its data */
export function deleteAgentConfig(id: string): void {
  const agentDir = getAgentDir(id);
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, { recursive: true });
  }
}
