/**
 * @fileoverview MCP server connection and tool wrapper.
 *
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Logger } from '../util/logger.js';
import { errorMessage } from '../util/errors.js';
import { APP_NAME, APP_VERSION } from '../util/app.js';
import type { Tool, ToolInput, ToolResult, JsonSchema } from '../tools/base.js';
import type {
  ConnectionType,
  McpClient,
  McpServerConfig,
  McpToolDefinition,
} from './types.js';
import type { McpOAuthProvider } from './oauth/provider.js';

//TODO: 这个是写死的配置, 以后要考虑放到前端的服务器设置里面给用户自行配置
const DEFAULT_TIMEOUTS = {
  connectTimeout: 60,
  executeTimeout: 120,
};

/**
 * Adapts a remote MCP tool into the local {@link Tool} interface.
 * Handles execution timeout and error/result normalization.
 *
 * name carries the entry-prefixed full name the model sees,
 * remoteName keeps the bare name the server expects in callTool.
 */
export class MCPTool implements Tool {
  public name: string;
  public description: string;
  public parameters: JsonSchema;

  /** 远端短名，callTool 与清单元数据共用，对外暴露只读 */
  public readonly remoteName: string;
  private session: McpClient;
  private executeTimeoutMs: number;
  constructor(options: {
    name: string;
    remoteName: string;
    description: string;
    parameters: JsonSchema;
    session: McpClient;
    executeTimeoutSec: number;
  }) {
    this.name = options.name;
    this.remoteName = options.remoteName;
    this.description = options.description;
    this.parameters = options.parameters;
    this.session = options.session;
    this.executeTimeoutMs = options.executeTimeoutSec * 1000;
  }

  /**
   * Execute the tool with the given parameters.
   *
   * @param params - Tool input arguments
   * @returns Normalized result with success/error status
   */
  async execute(params: ToolInput): Promise<ToolResult> {
    try {
      const result = await withTimeout(
        this.session.callTool({
          name: this.remoteName,
          arguments: params,
        }),
        this.executeTimeoutMs,
        `MCP tool '${this.name}' execution timed out after ${this.executeTimeoutMs / 1000}s`
      );

      const content = normalizeContent(result.content);
      const isError = Boolean(result.isError ?? result.is_error ?? false);

      return {
        success: !isError,
        content: isError ? '' : content,
        error: isError ? content || 'Tool returned error' : null,
      };
    } catch (error: unknown) {
      const message = errorMessage(error);
      return {
        success: false,
        content: '',
        error: `MCP tool execution failed: ${message}`,
      };
    }
  }
}

/**
 * Manages a single MCP server connection
 * Handles connection lifecycle, tool discovery, and OAuth authentication for remote servers.
 */
export class MCPServerConnection {
  public name: string;
  public connectionType: ConnectionType;
  public command?: string;
  public args: string[];
  public cwd?: string;
  public env: Record<string, string>;
  public url?: string;
  public headers: Record<string, string>;
  public connectTimeoutSec?: number;
  public executeTimeoutSec?: number;

  public tools: MCPTool[] = [];

  /** server 级整体说明（initialize 握手时的 instructions），无则为 undefined */
  public instructions?: string;

  private session: McpClient | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  private authProvider?: McpOAuthProvider;
  private onAppNotification?: (params: Record<string, unknown>) => void;
  /** 传输意外断开的回调，主动断开不触发 */
  private onClosed?: () => void;
  /** 服务端通知工具清单变化的回调 */
  private onToolListChanged?: () => void;
  /** 主动断开标志，区分意外断开与正常收尾 */
  private intentionallyClosed = false;

  constructor(options: {
    name: string;
    connectionType: ConnectionType;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    connectTimeoutSec?: number;
    executeTimeoutSec?: number;
    authProvider?: McpOAuthProvider;
    onAppNotification?: (params: Record<string, unknown>) => void;
    onClosed?: () => void;
    onToolListChanged?: () => void;
  }) {
    this.name = options.name;
    this.connectionType = options.connectionType;
    this.command = options.command;
    this.args = options.args ?? [];
    this.cwd = options.cwd;
    this.env = options.env ?? {};
    this.url = options.url;
    this.headers = options.headers ?? {};
    this.connectTimeoutSec = options.connectTimeoutSec;
    this.executeTimeoutSec = options.executeTimeoutSec;
    this.authProvider = options.authProvider;
    this.onAppNotification = options.onAppNotification;
    this.onClosed = options.onClosed;
    this.onToolListChanged = options.onToolListChanged;
  }

  private getConnectTimeoutSec(): number {
    return this.connectTimeoutSec ?? DEFAULT_TIMEOUTS.connectTimeout;
  }

  private getExecuteTimeoutSec(): number {
    return this.executeTimeoutSec ?? DEFAULT_TIMEOUTS.executeTimeout;
  }

  /**
   * Create the appropriate transport based on connection type.
   *
   * @throws {Error} If required config (command for stdio, url for remote) is missing
   */
  private createTransport():
    | StdioClientTransport
    | StreamableHTTPClientTransport {
    if (this.connectionType === 'stdio') {
      if (!this.command) {
        throw new Error('Missing command for stdio transport');
      }
      return new StdioClientTransport({
        command: this.command,
        args: this.args,
        cwd: this.cwd,
        // 注入 Python UTF-8 环境变量，避免中文 Windows 下 GBK 编码无法处理
        // MCP 服务启动横幅里的 Unicode 字符而崩溃。必须在此注入而非全局设置，
        // 因为 MCP SDK 的 getDefaultEnvironment 白名单不含这两个变量。
        env: { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', ...this.env },
        stderr: 'pipe',
      });
    }

    if (!this.url) {
      throw new Error('Missing url for remote transport');
    }

    return new StreamableHTTPClientTransport(new URL(this.url), {
      authProvider: this.authProvider,
      requestInit: {
        headers:
          Object.keys(this.headers).length > 0 ? this.headers : undefined,
      },
    });
  }

  /**
   * Connect to the MCP server and discover available tools.
   *
   * For remote servers requiring OAuth, returns `{ needsAuth: true }`. Read {@link authorizationUrl} to get the URL, then complete the OAuth flow before calling {@link connect} again.
   *
   * @returns Connection result with success status and optional auth requirement
   */
  async connect(): Promise<{
    success: boolean;
    needsAuth?: boolean;
    error?: string;
  }> {
    const connectTimeoutMs = this.getConnectTimeoutSec() * 1000;
    this.intentionallyClosed = false;
    const transport = this.createTransport();
    const client = new Client({
      name: APP_NAME,
      version: APP_VERSION,
    });

    // 通知分发：Agent App 的 notifications/app 与工具清单变化共用 fallback 挂点
    client.fallbackNotificationHandler = async (notification) => {
      if (notification.method === 'notifications/app') {
        this.onAppNotification?.(notification.params ?? {});
        return;
      }
      if (notification.method === 'notifications/tools/list_changed') {
        this.onToolListChanged?.();
      }
    };

    const session = client as unknown as McpClient;

    try {
      const toolsList = await withTimeout(
        (async () => {
          await session.connect(transport);
          return await session.listTools();
        })(),
        connectTimeoutMs,
        `Connection to MCP server '${this.name}' timed out after ${this.getConnectTimeoutSec()}s`
      );

      this.session = session;
      this.transport = transport;
      this.instructions = session.getInstructions?.();
      this.rebuildTools(toolsList.tools ?? []);

      // 意外断开的感知点，stdio 子进程退出与 http 传输关闭都落这里
      transport.onclose = () => {
        if (!this.intentionallyClosed) {
          this.onClosed?.();
        }
      };

      Logger.log(
        'MCP',
        `Connected to '${this.name}' (${this.connectionType}) - loaded ${this.tools.length} tools`
      );
      return { success: true };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedError) {
        this.transport = transport;
        Logger.log(
          'MCP',
          `Server '${this.name}' requires OAuth authentication`
        );
        if (session?.close) {
          await session.close().catch(() => {});
        }
        return { success: false, needsAuth: true };
      }

      const message = errorMessage(error);
      Logger.log(
        'ERROR',
        `Failed to connect MCP server '${this.name}': ${message}`
      );
      await this.disconnect();

      // spawn 找不到可执行文件时会产生 ENOENT，多是缺 uv 运行时二进制
      const isENOENT =
        (error as NodeJS.ErrnoException)?.code === 'ENOENT' ||
        message.includes('ENOENT');
      if (isENOENT) {
        Logger.log(
          'MCP',
          `ENOENT for '${this.name}', likely missing runtime binary`
        );
      }
      const errorText = isENOENT
        ? '未检测到 Python 环境'
        : `Connection failed: ${message}`;
      return { success: false, error: errorText };
    }
  }

  /**
   * 把一次 listTools 的结果包装成本地工具实例数组。
   * 对外 name 用 服务名__功能名 的全名，rawName 留短名给 callTool。
   * 首次连接与清单刷新共用。
   */
  private rebuildTools(definitions: McpToolDefinition[]): void {
    const executeTimeout = this.getExecuteTimeoutSec();
    this.tools = definitions.map((tool) => {
      const rawParameters = tool.inputSchema ?? tool.input_schema ?? {};
      return new MCPTool({
        name: `${this.name}__${tool.name}`,
        remoteName: tool.name,
        description: normalizeToolDescription(tool.description ?? ''),
        parameters: normalizeToolSchema(rawParameters),
        session: this.session!,
        executeTimeoutSec: executeTimeout,
      });
    });
  }

  /**
   * 全量重拉工具清单并重建本地实例。
   * 会话进行中调用是安全的，刷新只换实例数组不碰连接本身。
   *
   * @throws 连接已断开时抛 Error，调用方据状态跳过
   */
  async refreshTools(): Promise<MCPTool[]> {
    if (!this.session) {
      throw new Error(`Server '${this.name}' is not connected`);
    }
    const toolsList = await this.session.listTools();
    this.rebuildTools(toolsList.tools ?? []);
    return this.tools;
  }

  /** Close the session and transport, releasing all resources. */
  async disconnect(): Promise<void> {
    this.intentionallyClosed = true;
    const session = this.session;
    const transport = this.transport;
    this.session = null;
    this.transport = null;

    if (session?.close) {
      await session.close();
    }
    if (transport?.close) {
      await transport.close();
    }
  }

  /**
   * Exchange an OAuth authorization code for access tokens.
   *
   * @param code - Authorization code from the OAuth callback
   * @throws {Error} If no active transport or transport doesn't support OAuth
   */
  async finishAuth(code: string): Promise<void> {
    if (!this.transport) {
      throw new Error('No active transport to finish auth');
    }

    if (this.transport instanceof StreamableHTTPClientTransport) {
      Logger.log(
        'MCP-OAuth',
        `Finishing OAuth for '${this.name}' with authorization code`
      );
      await this.transport.finishAuth(code);
    } else {
      throw new Error('Transport does not support OAuth finishAuth');
    }
  }

  /** Authorization URL for the current OAuth flow. Available after {@link connect} returns `{ needsAuth: true }`. */
  get authorizationUrl(): string | undefined {
    return this.authProvider?.getAuthorizationUrl();
  }

  /** stdio 子进程的进程编号，非 stdio 或未连接时为 undefined，供清账记录使用 */
  get childPid(): number | undefined {
    return this.transport instanceof StdioClientTransport
      ? (this.transport.pid ?? undefined)
      : undefined;
  }
}

/**
 * Determine the connection type from server config.
 *
 * @param config - MCP server configuration
 * @returns 'stdio' for command-based configs, 'streamable_http' for URL-based
 */
export function determineConnectionType(
  config: McpServerConfig
): ConnectionType {
  const explicitType = config.type?.toLowerCase();

  switch (explicitType) {
    case 'stdio':
      return 'stdio';
    case 'http':
    case 'streamable_http':
      return 'streamable_http';
    default:
      if (config.url) {
        return 'streamable_http';
      }
      return 'stdio';
  }
}

/**
 * Wrap a promise with a timeout. If timeoutMs <= 0 or not finite,
 * the promise is returned as-is without a timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalize MCP tool result content to a plain string.
 * Handles string, array of content blocks (text extraction), and fallback JSON serialization.
 */
function normalizeContent(content: unknown): string {
  if (content === undefined || content === null) {
    return '';
  }
  const items = Array.isArray(content) ? content : [content];
  const parts: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      parts.push(item);
      continue;
    }
    if (isRecord(item) && typeof item['text'] === 'string') {
      parts.push(item['text']);
      continue;
    }
    try {
      parts.push(JSON.stringify(item));
    } catch {
      parts.push(String(item));
    }
  }
  return parts.join('\n');
}

/**
 * Normalize an MCP tool input schema into a simplified JSON Schema format.
 * Local $ref pointers are dereferenced first, so the whitelist below never
 * strands a reference without its definition table on strict providers.
 * Handles anyOf unwrapping (strips null variants), title-to-description conversion,
 * and preserves type, items, default, enum, required fields.
 */
export function normalizeToolSchema(schema: JsonSchema): JsonSchema {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const source = dereferenceToolSchema(schema);
  const normalized: JsonSchema = {
    type: (source['type'] as string) || 'object',
  };

  if (source['properties'] && isRecord(source['properties'])) {
    const normalizedProps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(source['properties'])) {
      if (!isRecord(value)) continue;

      const prop = value;
      const normalizedProp: Record<string, unknown> = {};

      if (prop['anyOf'] && Array.isArray(prop['anyOf'])) {
        const nonNullType = prop['anyOf'].find(
          (t: unknown) => isRecord(t) && t['type'] !== 'null'
        );
        if (nonNullType && isRecord(nonNullType)) {
          const typeObj = nonNullType;
          normalizedProp['type'] = typeObj['type'];
          if (typeObj['items']) {
            normalizedProp['items'] = typeObj['items'];
          }
        }
      } else if (prop['type']) {
        normalizedProp['type'] = prop['type'];
        if (prop['items']) {
          normalizedProp['items'] = prop['items'];
        }
      }

      if (prop['description']) {
        normalizedProp['description'] = prop['description'];
      } else if (prop['title'] && typeof prop['title'] === 'string') {
        normalizedProp['description'] = prop['title']
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .toLowerCase();
      }

      if (prop['default'] !== undefined) {
        normalizedProp['default'] = prop['default'];
      }

      if (prop['enum']) {
        normalizedProp['enum'] = prop['enum'];
      }

      normalizedProps[key] = normalizedProp;
    }

    normalized['properties'] = normalizedProps;
  }

  if (source['required'] && Array.isArray(source['required'])) {
    normalized['required'] = source['required'];
  }

  return normalized;
}

/** 引用指针认可的前缀，新式 $defs 与旧式 definitions 都收 */
const REF_PREFIXES = ['#/$defs/', '#/definitions/'];

/**
 * 取本地引用指针指向的定义名。
 * 外部 URL 引用不在处理范围，返回 undefined 交由剥离路径。
 */
function parseLocalRefName(ref: string): string | undefined {
  for (const prefix of REF_PREFIXES) {
    if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  }
  return undefined;
}

/**
 * 递归展开一个节点里的引用。
 *
 * - 引用按指针在定义表取目标，目标先展开再替换当前节点，兄弟字段覆盖其上
 * - 循环定义由展开路径上的名字栈拦截，引用链绕回自己即停止再入
 * - 解不开的引用剥掉，发出去的 schema 不留悬空指针
 *
 * @param node - 当前节点
 * @param defs - schema 自带的定义表
 * @param expanding - 当前展开路径上的定义名栈
 */
function dereferenceNode(
  node: unknown,
  defs: Record<string, unknown>,
  expanding: string[]
): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => dereferenceNode(item, defs, expanding));
  }
  if (!isRecord(node)) return node;
  const ref = node['$ref'];
  if (typeof ref === 'string') {
    const name = parseLocalRefName(ref);
    const target = name !== undefined ? defs[name] : undefined;
    const siblings = { ...node };
    delete siblings['$ref'];
    if (name !== undefined && isRecord(target) && !expanding.includes(name)) {
      const resolved = dereferenceNode(target, defs, [
        ...expanding,
        name,
      ]) as Record<string, unknown>;
      const merged = dereferenceNode(siblings, defs, expanding) as Record<
        string,
        unknown
      >;
      return { ...resolved, ...merged };
    }
    return dereferenceNode(siblings, defs, expanding);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = dereferenceNode(value, defs, expanding);
  }
  return out;
}

/**
 * 展开工具 schema 里的全部本地引用。
 * 白名单清洗不保留定义区，引用在清洗前就地展开成完整定义，
 * 展平后的 schema 自包含，不依赖厂商的引用解析能力。
 *
 * @param schema - MCP 工具声明的原始参数 schema
 * @returns 不含任何本地引用的展开版 schema
 */
function dereferenceToolSchema(schema: JsonSchema): JsonSchema {
  const defs: Record<string, unknown> = {};
  for (const key of ['$defs', 'definitions']) {
    const table = schema[key];
    if (isRecord(table)) Object.assign(defs, table);
  }
  const rest = { ...schema };
  delete rest['$defs'];
  delete rest['definitions'];
  return dereferenceNode(rest, defs, []) as JsonSchema;
}

/** Collapse excessive whitespace and newlines in tool descriptions. */
function normalizeToolDescription(description: string): string {
  if (!description) return '';
  return description
    .replace(/\n\s+/g, '\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
