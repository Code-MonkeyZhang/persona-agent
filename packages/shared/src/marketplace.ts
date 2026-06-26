/**
 * Marketplace 清单条目的 schema 与类型。
 * 一份清单是一个由此条目组成的数组，前后端共用。
 */
import { z } from 'zod';

export const MarketplaceEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  author: z.string(),
  homepage: z.string().url(),
  version: z.string(),
  path: z.string().min(1),
});

export type MarketplaceEntry = z.infer<typeof MarketplaceEntrySchema>;

// --- MCP 商城 ---

/**
 * MCP 商城清单条目。
 * 公共基座 name/description/author/homepage/version/path + 可选的 logo 字段。
 * logo 缺失时前端用扳手图标兜底，不会阻塞上架。
 * 清单里没有 mcpConfig / source / userConfig 字段——
 * MCP 配置在商品文件夹的 mcp.json 文件里（不在清单中），
 * 需要 API Key 等 env 值由用户装完后自行在设置页填（不归商城管）。
 */
export const McpMarketplaceEntrySchema = MarketplaceEntrySchema.extend({
  logo: z.string().optional(),
});

export type McpMarketplaceEntry = z.infer<typeof McpMarketplaceEntrySchema>;

// --- Agent 商城 ---

/**
 * Agent 商城清单条目。
 * 公共基座 + 可选的 voiceSample, 语音样本文件名。
 * 卡片展示图直接取自 assets/avatar.png，与聊天头像共用同一张图，不在清单字段里。
 *
 * Agent 商品文件夹里还包含 config.json 人设配置和 assets/ 目录,
 * 但这些不在清单字段里——由下载器扫描文件夹得到。
 */
export const AgentMarketplaceEntrySchema = MarketplaceEntrySchema.extend({
  voiceSample: z.string().optional(),
});

export type AgentMarketplaceEntry = z.infer<typeof AgentMarketplaceEntrySchema>;
