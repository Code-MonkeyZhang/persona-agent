/**
 * @fileoverview MCP configuration file loader.
 *
 * Reads mcp.json from ~/.local/share/persona-agent/mcp/mcp.json and returns
 * the parsed server configurations. Also absorbs legacy mcp-meta.json
 * sidecar files into config entries once, so display info travels with
 * the config itself.
 */

import { Logger } from '../util/logger.js';
import { readJsonFile } from '../util/fs-helpers.js';
import { getMcpConfigPath, getMcpServersDir } from '../util/paths.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpConfigFile, McpServerConfig } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 旧版旁挂 meta 里携带的显示字段，迁移时逐字段吸收进配置条目 */
const LEGACY_META_KEYS = [
  'displayName',
  'author',
  'description',
  'homepage',
  'logoUrl',
  'logoFile',
] as const;

/**
 * 一次性迁移：把旧版旁挂 mcp-meta.json 的显示字段吸收进配置条目。
 *
 * 旧安装的显示身份存在 servers/<name>/mcp-meta.json，本版本起内联进
 * 配置条目。meta 里有值的字段覆盖配置，与旧投影的优先级一致；合并后
 * 回写 mcp.json，成功才删 meta 文件，失败保留待下次启动重试。
 * 条目就地修改，无 meta 文件时不动作。
 */
function migrateLegacyMeta(configPath: string, config: McpConfigFile): void {
  const servers = config.mcpServers ?? {};
  const absorbed: string[] = [];

  for (const [name, serverConfigValue] of Object.entries(servers)) {
    if (!isRecord(serverConfigValue)) continue;

    const metaPath = path.join(getMcpServersDir(), name, 'mcp-meta.json');
    const meta = readJsonFile<Record<string, unknown> | null>(metaPath, null);
    if (!meta) continue;

    for (const key of LEGACY_META_KEYS) {
      if (typeof meta[key] === 'string') {
        serverConfigValue[key] = meta[key];
      }
    }
    absorbed.push(metaPath);
  }

  if (absorbed.length === 0) return;

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    for (const metaPath of absorbed) {
      fs.rmSync(metaPath);
    }
    Logger.log(
      'MCP',
      `Migrated legacy mcp-meta.json into config for ${absorbed.length} server(s)`
    );
  } catch (error) {
    // 回写失败保留 meta 文件，本次会话仍用内存里的合并值，下次启动重试
    Logger.log('MCP', 'Legacy meta migration failed, will retry next boot', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Load and parse the MCP config file.
 *
 * @param configPath - Optional custom path to mcp.json (default: ~/.local/share/persona-agent/mcp/mcp.json)
 * @returns A map of server name -> server config, or an empty map if file doesn't exist or cannot be parsed
 */
export function loadMcpConfig(
  configPath?: string
): Map<string, McpServerConfig> {
  const resolvedPath = configPath ?? getMcpConfigPath();
  const result = new Map<string, McpServerConfig>();

  const config = readJsonFile<McpConfigFile | null>(resolvedPath, null);
  if (!config) return result;

  const servers = config.mcpServers ?? {};

  if (!isRecord(servers) || Object.keys(servers).length === 0) {
    Logger.log('MCP', 'No MCP servers configured');
    return result;
  }

  migrateLegacyMeta(resolvedPath, config);

  for (const [name, serverConfigValue] of Object.entries(servers)) {
    if (!isRecord(serverConfigValue)) {
      Logger.log('MCP', `Skipping invalid server config: ${name}`);
      continue;
    }

    const serverConfig = serverConfigValue as McpServerConfig;
    if (serverConfig.disabled) {
      Logger.log('MCP', `Skipping disabled server: ${name}`);
      continue;
    }

    result.set(name, serverConfig);
  }

  Logger.log('MCP', `Loaded ${result.size} MCP server configs`);
  return result;
}

/**
 * 把一个 MCP server 配置写进用户的 mcp.json（读-改-写）。
 *
 * 如果同名 server 已存在，覆盖它的配置。
 * 用于商城安装流程（替换完占位符后的最终配置写在这里持久化）。
 *
 * @param name server 名字（= 文件夹名 = mcp.json 里的 key）
 * @param config server 配置（占位符已替换完毕）
 */
export function saveMcpServer(name: string, config: McpServerConfig): void {
  const configPath = getMcpConfigPath();
  const existing = readJsonFile<McpConfigFile>(configPath, { mcpServers: {} });
  if (!existing.mcpServers) {
    existing.mcpServers = {};
  }
  existing.mcpServers[name] = config;
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
  Logger.log('MCP', `Saved MCP server config: ${name}`);
}

/**
 * 从用户的 mcp.json 里删除一个 MCP server 配置（读-改-写）。
 *
 * 如果不存在则静默跳过（幂等）。
 * 用于商城卸载流程。
 *
 * @param name server 名字
 */
export function deleteMcpServer(name: string): void {
  const configPath = getMcpConfigPath();
  const existing = readJsonFile<McpConfigFile>(configPath, { mcpServers: {} });
  if (existing.mcpServers) {
    delete existing.mcpServers[name];
  }
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
  Logger.log('MCP', `Deleted MCP server config: ${name}`);
}
