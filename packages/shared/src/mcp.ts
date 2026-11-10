/** MCP server connection status */
export type McpServerStatus =
  | 'connecting'
  | 'connected'
  | 'needs_auth'
  | 'failed';

/** Agent App 支持的端类型，用于客户端列表筛选 */
export type SupportedUI = 'desktop' | 'mobile';

/** 列表接口透出的单个工具元数据，详情页功能表格渲染用 */
export interface McpToolInfo {
  name: string;
  description?: string;
}

/** 列表接口推导的连接类型，oauth 表示远程服务且需要授权 */
export type McpConnectionType = 'stdio' | 'http' | 'oauth';

/** MCP server info returned by GET /api/mcp (projection of server-internal entry) */
export interface McpServerInfo {
  name: string;
  /** 显示名，服务端兜底机器键后必有值，前端直接使用 */
  displayName: string;
  /** 简介，取 mcp.json 条目里的声明 */
  description?: string;
  /** 作者，商城安装时取清单 author */
  author?: string;
  /** 本地图标相对地址挂内容哈希，本地文件缺失回退配置里的远程网址 */
  logoUrl?: string;
  status: McpServerStatus;
  toolCount: number;
  /** 工具明细，握手成功后可用 */
  tools?: McpToolInfo[];
  /** 握手时服务端声明的使用文档 */
  instructions?: string;
  /** 远程服务的地址，stdio 服务缺省 */
  url?: string;
  /** 由状态与配置推导的连接类型 */
  connectionType?: McpConnectionType;
  /** Agent App 标记：true 表示该 MCP Server 附带 Web UI，前端渲染图标栏 */
  agentApp?: boolean;
  /** 支持的端，客户端筛选用；未声明时默认只支持 desktop */
  supportedUI?: SupportedUI[];
  error?: string;
  oauthUrl?: string;
}

/** OAuth flow status returned by GET /api/mcp/:name/oauth/status */
export interface McpOAuthStatus {
  status: McpServerStatus;
  oauthUrl?: string;
  error?: string;
}

/** 工具注册表条目的来源标记 */
export type ToolEntryKind = 'builtin' | 'mcp' | 'app';

/** 注册表功能清单项，name 是模型侧全名，shortName 供界面显示 */
export interface ToolFunctionInfo {
  name: string;
  shortName: string;
  description?: string;
}

/**
 * 工具注册表条目，GET /api/tools 的投影。
 * 内置、MCP、App 三类来源统一形状，assigned 仅在带 agentId 查询时给出。
 */
export interface ToolEntryInfo {
  id: string;
  kind: ToolEntryKind;
  name: string;
  description?: string;
  status: McpServerStatus;
  functions: ToolFunctionInfo[];
  url?: string;
  logoUrl?: string;
  instructions?: string;
  author?: string;
  error?: string;
  oauthUrl?: string;
  assigned?: boolean;
}
