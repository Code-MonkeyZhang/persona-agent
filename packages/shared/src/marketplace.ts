/**
 * Marketplace 清单条目的 schema 与类型。
 * 一份清单是一个由此条目组成的数组，前后端共用。
 */
import { z } from 'zod';

/**
 * 清单条目的公共基座，三类商品共用。
 * id 是机器键，值等于商品文件夹名，消费方优先读它取身份，缺失时回退 path 派生，
 * 过渡期可选，存量清单不带也能通过校验。
 * logo 是条目图字段，值为文件夹内的图片文件名，缺失时各端走兜底图标或约定路径。
 */
export const MarketplaceEntrySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string(),
  author: z.string(),
  homepage: z.string().url(),
  path: z.string().min(1),
  logo: z.string().optional(),
});

export type MarketplaceEntry = z.infer<typeof MarketplaceEntrySchema>;

// --- MCP 商城 ---

/**
 * MCP 商城清单条目。
 * 公共基座加 runtime 与 agentApp 两个自研型专属字段。
 * 图字段 logo 从基座继承，缺失时前端用扳手图标兜底，不会阻塞上架。
 * runtime 标识自研型 MCP 需要的运行时，如 'uv'，用于安装前拦截检测；
 * 缺失表示远程型 MCP，不需要运行时。
 * agentApp 标识该商品是 Agent App（带界面的工具）：前端据此分桶到商城「应用」Tab，
 * 安装后进 App 图标栏；缺失表示普通 MCP。
 * 清单里没有 mcpConfig / source / userConfig 字段——
 * MCP 配置在商品文件夹的 mcp.json 文件里，不在清单中，
 * 需要 API Key 等 env 值由用户装完后自行在设置页填，不归商城管。
 */
export const McpMarketplaceEntrySchema = MarketplaceEntrySchema.extend({
  runtime: z.enum(['uv']).optional(),
  agentApp: z.boolean().optional(),
});

export type McpMarketplaceEntry = z.infer<typeof McpMarketplaceEntrySchema>;

// --- Agent 商城 ---

/**
 * Agent 商城清单条目。
 * 公共基座 + 可选的 voiceSample, 语音样本文件名。
 * 卡片展示图优先取基座继承的 logo 字段，缺失回退 assets/avatar.png 与聊天头像共用。
 *
 * Agent 商品文件夹里还包含 config.json 人设配置和 assets/ 目录,
 * 但这些不在清单字段里——由下载器扫描文件夹得到。
 */
export const AgentMarketplaceEntrySchema = MarketplaceEntrySchema.extend({
  voiceSample: z.string().optional(),
});

export type AgentMarketplaceEntry = z.infer<typeof AgentMarketplaceEntrySchema>;
