import {
  MarketplaceEntrySchema,
  McpMarketplaceEntrySchema,
  type MarketplaceEntry,
  type McpMarketplaceEntry,
} from '@persona/shared';
import { manifestUrl, mcpManifestUrl } from './config.js';
import { Logger } from '../util/logger.js';

/**
 * 从 jsDelivr CDN 拉取并校验 Skill 清单。
 *
 * 清单每次都重新拉，不缓存、不做断网兜底。
 * 走后端代理而不是前端直连，原因：绕开浏览器 CORS，并把 CDN 地址前缀集中在后端配置。
 *
 * @throws 网络失败或清单格式非法时抛出
 */
export async function fetchManifest(): Promise<MarketplaceEntry[]> {
  const resp = await fetch(manifestUrl());
  if (!resp.ok) {
    throw new Error(`Failed to fetch marketplace manifest: ${resp.status}`);
  }
  const data = (await resp.json()) as unknown;
  const result = MarketplaceEntrySchema.array().safeParse(data);
  if (!result.success) {
    Logger.log('MARKETPLACE', 'Invalid manifest schema', result.error);
    throw new Error('Marketplace manifest format is invalid');
  }
  return result.data;
}

/**
 * 拉取并校验 MCP 商城清单。
 * 走后端代理 jsDelivr CDN（和 Skill 清单一样的模式）。
 *
 * @returns MCP 商城条目数组
 * @throws 网络错误或清单格式非法时抛出
 */
export async function fetchMcpManifest(): Promise<McpMarketplaceEntry[]> {
  const resp = await fetch(mcpManifestUrl());
  if (!resp.ok) {
    throw new Error(`Failed to fetch MCP manifest: ${resp.status}`);
  }
  const data = (await resp.json()) as unknown;
  const result = McpMarketplaceEntrySchema.array().safeParse(data);
  if (!result.success) {
    Logger.log('MARKETPLACE', 'Invalid MCP manifest schema', result.error);
    throw new Error('MCP marketplace manifest format is invalid');
  }
  return result.data;
}
