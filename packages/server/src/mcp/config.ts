/**
 * @fileoverview MCP configuration file loader.
 *
 * Reads mcp.json from ~/.local/share/persona-agent/mcp/mcp.json and returns
 * the parsed server configurations.
 */

import { Logger } from '../util/logger.js';
import { readJsonFile } from '../util/fs-helpers.js';
import { getMcpConfigPath } from '../util/paths.js';
import * as fs from 'node:fs';
import type { McpConfigFile, McpServerConfig } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
