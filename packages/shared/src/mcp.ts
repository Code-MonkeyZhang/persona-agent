/** MCP server connection status */
export type McpServerStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'needs_auth';

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
  /** 安装时落盘的显示名，手动添加的服务缺省，前端回退机器键 */
  displayName?: string;
  /** 简介，优先取安装 meta，回退 mcp.json 里的声明 */
  description?: string;
  /** 安装时落盘的作者 */
  author?: string;
  /** 本地图标相对地址挂内容哈希，本地文件缺失回退安装时的远程网址 */
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
