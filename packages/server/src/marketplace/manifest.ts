import {
  MarketplaceEntrySchema,
  McpMarketplaceEntrySchema,
  AgentMarketplaceEntrySchema,
  type MarketplaceEntry,
  type McpMarketplaceEntry,
  type AgentMarketplaceEntry,
} from '@persona/shared';
import type { ZodType } from 'zod';
import { manifestUrl, mcpManifestUrl, agentManifestUrl } from './config.js';
import { Logger } from '../util/logger.js';

/** 单类清单的缓存条目；TTL 过期后仍保留作 stale 兜底 */
type ManifestCacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const MANIFEST_TTL_MS = 5 * 60_000;
const DEFAULT_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;

const cache = new Map<string, ManifestCacheEntry<unknown>>();

// 429 退避截止时间戳；三类清单同域，限流一起触发，共用一个
let backoffUntil = 0;

/** 读 Retry-After 头换算退避时长；非法或缺失时用默认值，设上限防止长锁 */
function backoffMsFrom(resp: Response): number {
  const seconds = Number(resp.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_BACKOFF_MS;
  return Math.min(seconds * 1000, MAX_BACKOFF_MS);
}

/** 剩余冷却秒数，向上取整且最小为 1；用于拼进错误信息提示用户稍后重试 */
function remainingBackoffSeconds(): number {
  return Math.max(1, Math.ceil((backoffUntil - Date.now()) / 1000));
}

/** zod 校验；失败时记日志并抛错，抛出的错误由上层 stale 兜底接管 */
function parseManifest<T>(data: unknown, schema: ZodType<T>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    Logger.log('MARKETPLACE', `Invalid ${label} manifest schema`, result.error);
    throw new Error(`${label} manifest format is invalid`);
  }
  return result.data;
}

/**
 * 带缓存与兜底的清单拉取，三类清单共用：
 * - TTL 内直接返回缓存，不发网络请求
 * - 429 后进入退避窗口，窗口内不发真实请求，有旧缓存则返回旧数据
 * - 拉取失败或格式非法时，有旧缓存则返回旧数据，否则抛错
 * - 无缓存时的 429 错误信息携带剩余冷却秒数，提示稍后重试
 */
async function fetchWithCache<T extends unknown[]>(
  cacheKey: string,
  url: () => string,
  failPrefix: string,
  validate: (data: unknown) => T
): Promise<T> {
  const entry = cache.get(cacheKey) as ManifestCacheEntry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < MANIFEST_TTL_MS) {
    return entry.data;
  }

  if (Date.now() < backoffUntil) {
    if (entry) {
      Logger.log(
        'MARKETPLACE',
        `${cacheKey} manifest serves stale during backoff`
      );
      return entry.data;
    }
    throw new Error(
      `${failPrefix}: 429, retry in ~${remainingBackoffSeconds()}s`
    );
  }

  try {
    const resp = await fetch(url(), { verbose: true });
    if (resp.status === 429) {
      backoffUntil = Date.now() + backoffMsFrom(resp);
      Logger.log(
        'MARKETPLACE',
        `${cacheKey} manifest rate-limited, back off until ${new Date(backoffUntil).toISOString()}`
      );
    }
    if (!resp.ok) {
      throw new Error(
        resp.status === 429
          ? `${failPrefix}: 429, retry in ~${remainingBackoffSeconds()}s`
          : `${failPrefix}: ${resp.status}`
      );
    }
    const data = validate(await resp.json());
    cache.set(cacheKey, { data, fetchedAt: Date.now() });
    Logger.log(
      'MARKETPLACE',
      `${cacheKey} manifest fetched, ${data.length} entries`
    );
    return data;
  } catch (err) {
    if (entry) {
      Logger.log(
        'MARKETPLACE',
        `${cacheKey} manifest fetch failed, serving stale`,
        err
      );
      return entry.data;
    }
    throw err;
  }
}

/**
 * 从 GitHub raw 拉取并校验 Skill 清单。
 *
 * 走后端代理而不是前端直连，原因：绕开浏览器 CORS，并把 GitHub raw 地址前缀集中在后端配置。
 *
 * @throws 无缓存可用且拉取失败或清单格式非法时抛出
 */
export async function fetchManifest(): Promise<MarketplaceEntry[]> {
  return fetchWithCache(
    'skills',
    manifestUrl,
    'Failed to fetch marketplace manifest',
    (data) => parseManifest(data, MarketplaceEntrySchema.array(), 'Marketplace')
  );
}

/**
 * 拉取并校验 MCP 商城清单。
 * 走后端代理 GitHub raw, 和 Skill 清单一样的模式。
 *
 * @throws 无缓存可用且网络错误或清单格式非法时抛出
 */
export async function fetchMcpManifest(): Promise<McpMarketplaceEntry[]> {
  return fetchWithCache(
    'mcps',
    mcpManifestUrl,
    'Failed to fetch MCP manifest',
    (data) => parseManifest(data, McpMarketplaceEntrySchema.array(), 'MCP')
  );
}

/**
 * 拉取并校验 Agent 商城清单。
 * 走后端代理 GitHub raw, 和 Skill / MCP 清单一样的模式。
 *
 * @throws 无缓存可用且网络错误或清单格式非法时抛出
 */
export async function fetchAgentManifest(): Promise<AgentMarketplaceEntry[]> {
  return fetchWithCache(
    'agents',
    agentManifestUrl,
    'Failed to fetch agent manifest',
    (data) => parseManifest(data, AgentMarketplaceEntrySchema.array(), 'Agent')
  );
}

/** 清空缓存与退避状态，仅供测试隔离使用 */
export function resetManifestCache(): void {
  cache.clear();
  backoffUntil = 0;
}
