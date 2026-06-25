/**
 * @fileoverview MCP 商城安装/卸载编排。
 *
 * installMcp：下载 → 读 mcp.json → 替换占位符 → 写用户配置 → 连接池注册。
 * uninstallMcp：断连 + 出池 → 从配置删 → 删代码目录。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { readJsonFile } from '../util/fs-helpers.js';
import { getMcpServersDir } from '../util/paths.js';
import { downloadMcp } from './downloader.js';
import { folderNameOf } from './util.js';
import { saveMcpServer, deleteMcpServer } from '../mcp/config.js';
import { addServer, removeServer } from '../mcp/pool.js';
import { Logger } from '../util/logger.js';
import type { McpMarketplaceEntry } from '@persona/shared';
import type { McpServerConfig } from '../mcp/types.js';

/**
 * 替换 mcp.json 配置里的占位符。
 *
 * ${SERVERS_DIR} → servers 目录的绝对路径（自研代码型用）
 *
 * 实现方式：JSON.stringify → replaceAll → JSON.parse。
 * 这样一次性处理所有嵌套位置（command / args / cwd / env / headers 等），
 * 不需要递归遍历对象。
 */
function substitutePlaceholders(
  config: McpServerConfig,
  serversDir: string
): McpServerConfig {
  const str = JSON.stringify(config).replaceAll('${SERVERS_DIR}', serversDir);
  return JSON.parse(str) as McpServerConfig;
}

/**
 * 安装一个 MCP 商城商品。
 *
 * 流程：下载文件夹 → 读 mcp.json → 替换 ${SERVERS_DIR} → 写用户配置 → 连接池注册。
 * 不自动分配给 Agent——分配是前端在 AgentToolsView 里做的事。
 *
 * @param entry MCP 清单条目
 * @throws mcp.json 解析失败、下载失败时抛出（mcp.json 失败会回滚已下载的文件）
 */
export async function installMcp(entry: McpMarketplaceEntry): Promise<void> {
  const name = folderNameOf(entry);
  const serversDir = getMcpServersDir();

  Logger.log('MARKETPLACE', `Installing MCP '${name}'`);

  // ① 下载整个商品文件夹到 servers/<name>/
  const mcpDir = await downloadMcp(entry);
  Logger.log('MARKETPLACE', `Downloaded '${name}' to ${mcpDir}`);

  // ② 读商品自带的 mcp.json
  const configPath = path.join(mcpDir, 'mcp.json');
  const rawConfig = readJsonFile<McpServerConfig | null>(configPath, null);
  if (!rawConfig) {
    // mcp.json 不存在或解析不了——回滚已下载的文件
    Logger.log('MARKETPLACE', `mcp.json not found or invalid at ${configPath}`);
    fs.rmSync(mcpDir, { recursive: true });
    throw new Error('下载的 mcp.json 无法解析，请向作者反馈');
  }
  Logger.log('MARKETPLACE', `Parsed mcp.json for '${name}'`, {
    type: rawConfig.type,
    command: rawConfig.command,
  });

  // ③ 替换占位符
  const config = substitutePlaceholders(rawConfig, serversDir);

  // ④ 写进用户的 mcp.json（持久化，保证重启后能重连）
  saveMcpServer(name, config);
  Logger.log('MARKETPLACE', `Saved config for '${name}' to user mcp.json`);

  // ⑤ 注册到连接池并连接（不抛异常——连接失败不回滚，用户在 UI 上能看到状态）
  await addServer(name, config);
  Logger.log('MARKETPLACE', `MCP '${name}' installed successfully`);
}

/**
 * 卸载一个 MCP。
 *
 * 流程：断连 + 出池 → 从 mcp.json 删 → 删代码目录。
 *
 * @param name MCP 名字（= 文件夹名 = mcp.json 里的 key）
 */
export async function uninstallMcp(name: string): Promise<void> {
  Logger.log('MARKETPLACE', `Uninstalling MCP '${name}'`);

  // ① 断连 + 从池中移除
  await removeServer(name);

  // ② 从用户的 mcp.json 中删除
  deleteMcpServer(name);

  // ③ 删除代码目录（自研型才有实质内容；远程型只有 logo + mcp.json）
  const mcpDir = path.join(getMcpServersDir(), name);
  if (fs.existsSync(mcpDir)) {
    fs.rmSync(mcpDir, { recursive: true });
  }

  Logger.log('MARKETPLACE', `MCP '${name}' uninstalled successfully`);
}
