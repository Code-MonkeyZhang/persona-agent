/**
 * @fileoverview Type definitions for the MCP module.
 */

import type { JsonSchema } from '../tools/base.js';
import type { Tool } from '../tools/base.js';
import type { McpServerStatus, SupportedUI } from '@persona/shared';

export type { McpServerStatus, SupportedUI } from '@persona/shared';

export type ConnectionType = 'stdio' | 'streamable_http';

export interface McpCallToolResult {
  content?: unknown;
  isError?: boolean;
  is_error?: boolean;
}

export interface McpListToolsResult {
  tools: McpToolDefinition[];
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  input_schema?: JsonSchema;
}

export type McpClient = {
  connect: (transport: unknown) => Promise<void>;
  listTools: () => Promise<McpListToolsResult>;
  callTool: (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<McpCallToolResult>;
  close?: () => Promise<void>;
  /** 读取 server 在 initialize 握手时声明的 instructions（server 级整体说明） */
  getInstructions?: () => string | undefined;
};

export type Closable = {
  close?: () => Promise<void> | void;
};

export type ClientConstructor = new (options: {
  name: string;
  version: string;
}) => McpClient;

export type TransportConstructor = new (
  options: Record<string, unknown>
) => Closable;

export interface McpServerConfig {
  description?: string;
  type?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  connect_timeout?: number;
  execute_timeout?: number;
  /** Agent App 标记：true 表示该 server 附带 Web UI，需要分配 HTTP 端口 */
  agentApp?: boolean;
  /** 支持的端，客户端筛选用；未声明时默认只支持 desktop */
  supportedUI?: SupportedUI[];
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface McpToolMeta {
  id: string;
  name: string;
  description: string;
}

export interface McpServerEntry {
  name: string;
  config: McpServerConfig;
  status: McpServerStatus;
  tools: McpToolMeta[];
  /** Agent App 标记，从 config 投影，方便内部逻辑直接判断 */
  agentApp?: boolean;
  /** 支持的端，从 config 投影，随 /api/mcp 透出给客户端筛选 */
  supportedUI?: SupportedUI[];
  error?: string;
  oauthUrl?: string;
}

export interface McpConnection {
  name: string;
  tools: Tool[];
  disconnect: () => Promise<void>;
}
