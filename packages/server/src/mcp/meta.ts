/**
 * @fileoverview MCP 安装元数据的落盘与读取。
 * 商城商品的显示信息在安装时写进服务目录的 mcp-meta.json，
 * 连接池构建条目时读出叠加，meta 缺失的手动服务不受影响。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getMcpServersDir } from '../util/paths.js';
import { Logger } from '../util/logger.js';

export const MCP_META_FILE_NAME = 'mcp-meta.json';

/** mcp-meta.json 的字段，全部可选，缺失字段读出时被过滤 */
export interface McpServerMeta {
  displayName?: string;
  author?: string;
  description?: string;
  homepage?: string;
  logoUrl?: string;
  logoFile?: string;
}

const META_STRING_KEYS = [
  'displayName',
  'author',
  'description',
  'homepage',
  'logoUrl',
  'logoFile',
] as const;

/**
 * 把商城条目的显示信息写进服务目录，安装器在下载完成后调用。
 */
export function writeMcpMeta(destDir: string, meta: McpServerMeta): void {
  fs.writeFileSync(
    path.join(destDir, MCP_META_FILE_NAME),
    JSON.stringify(meta, null, 2)
  );
}

/**
 * 读指定服务的安装元数据。
 * 文件缺失或内容非法时返回 undefined，服务本身保持可用。
 */
export function readMcpMeta(name: string): McpServerMeta | undefined {
  try {
    const metaPath = path.join(getMcpServersDir(), name, MCP_META_FILE_NAME);
    if (!fs.existsSync(metaPath)) return undefined;
    return sanitizeMcpMeta(JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
  } catch (error) {
    Logger.log('MCP', `Failed to read meta of '${name}', skipping`, error);
    return undefined;
  }
}

/** 只保留非空字符串字段，坏数据不进池 */
function sanitizeMcpMeta(raw: Record<string, unknown>): McpServerMeta {
  const meta: McpServerMeta = {};
  for (const key of META_STRING_KEYS) {
    const value = raw[key];
    if (typeof value === 'string' && value.length > 0) {
      meta[key] = value;
    }
  }
  return meta;
}
