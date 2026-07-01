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
import { AppError } from '../util/errors.js';
import { detectUv, syncDeps } from '../util/uv-runtime.js';
import type { McpMarketplaceEntry } from '@persona/shared';
import type { McpServerConfig } from '../mcp/types.js';

/**
 * 替换 mcp.json 配置里的占位符。
 *
 * ${SERVERS_DIR} → servers 目录的绝对路径，自研代码型用
 *
 * 实现方式：先转义 serversDir，再 JSON.stringify → replaceAll → JSON.parse。
 * 这样一次性处理所有嵌套位置：command、args、cwd、env、headers 等，
 * 不需要递归遍历对象。
 *
 * serversDir 经 JSON.stringify 转义并去掉首尾引号后，得到可安全嵌入
 * JSON 字符串字面量的形式，使 Windows 路径的反斜杠被正确处理，避免
 * \U 等非法转义导致 JSON.parse 失败。
 */
function substitutePlaceholders(
  config: McpServerConfig,
  serversDir: string
): McpServerConfig {
  const escaped = JSON.stringify(serversDir).slice(1, -1);
  const str = JSON.stringify(config).replaceAll('${SERVERS_DIR}', escaped);
  return JSON.parse(str) as McpServerConfig;
}

/**
 * 安装一个 MCP 商城商品。
 *
 * 流程：运行时拦截 → 下载文件夹 → 读 mcp.json → 替换 ${SERVERS_DIR}
 *       → 写用户配置 → uv sync 预装依赖 → 连接池注册。
 * 不自动分配给 Agent——分配是前端在 AgentToolsView 里做的事。
 *
 * @param entry MCP 清单条目
 * @throws uv 缺失、mcp.json 解析失败、下载失败、uv sync 失败时抛出
 */
export async function installMcp(entry: McpMarketplaceEntry): Promise<void> {
  const name = folderNameOf(entry);
  const serversDir = getMcpServersDir();

  Logger.log('MARKETPLACE', `Installing MCP '${name}'`);

  // 下载前运行时拦截：自研型 MCP 需要 uv，没装就不下载任何东西
  if (entry.runtime === 'uv') {
    const uv = await detectUv();
    if (!uv.ok) {
      throw new AppError(
        400,
        '未检测到 uv 运行时，请先前往 设置 → 通用 → 环境 一键下载'
      );
    }
  }

  // 下载整个商品文件夹到 servers/<name>/
  const mcpDir = await downloadMcp(entry);
  Logger.log('MARKETPLACE', `Downloaded '${name}' to ${mcpDir}`);

  // 读商品自带的 mcp.json
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

  // 替换占位符
  const config = substitutePlaceholders(rawConfig, serversDir);

  // 写进用户的 mcp.json，持久化保证重启后能重连
  saveMcpServer(name, config);
  Logger.log('MARKETPLACE', `Saved config for '${name}' to user mcp.json`);

  // uv sync 预装依赖，仅 command 为 uv 的 MCP 需要
  // 预装后 addServer 时 uv run 直接启动，不会超 60s 连接超时
  if (config.command === 'uv') {
    Logger.log('MARKETPLACE', `Pre-installing dependencies for '${name}'`);
    await syncDeps(mcpDir);
  }

  // 注册到连接池并连接，不抛异常，连接失败不回滚，用户在 UI 上能看到状态
  await addServer(name, config);
  Logger.log('MARKETPLACE', `MCP '${name}' installed successfully`);
}

/**
 * 卸载一个 MCP。
 *
 * 流程：断连 + 出池 → 从 mcp.json 删 → 删代码目录。
 *
 * @param name MCP 名字，等于文件夹名和 mcp.json 里的 key
 */
export async function uninstallMcp(name: string): Promise<void> {
  Logger.log('MARKETPLACE', `Uninstalling MCP '${name}'`);

  // 断连 + 从池中移除
  await removeServer(name);

  // 从用户的 mcp.json 中删除
  deleteMcpServer(name);

  // 删除代码目录，自研型才有实质内容，远程型只有 logo + mcp.json
  const mcpDir = path.join(getMcpServersDir(), name);
  if (fs.existsSync(mcpDir)) {
    fs.rmSync(mcpDir, { recursive: true });
  }

  Logger.log('MARKETPLACE', `MCP '${name}' uninstalled successfully`);
}
