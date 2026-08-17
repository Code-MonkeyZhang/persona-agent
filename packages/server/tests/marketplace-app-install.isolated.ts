/**
 * @fileoverview Agent App 商城安装透传测试
 * 覆盖：清单 schema 的 agentApp 字段解析；installMcp 安装链路中
 * 商品 mcp.json 里的 agentApp / supportedUI 标记原样透传到用户配置与连接池。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  McpMarketplaceEntrySchema,
  type McpMarketplaceEntry,
} from '@persona/shared';

let tempDir: string;
let serversDir: string;
/** saveMcpServer / addServer 捕获到的配置 */
let savedConfig: Record<string, unknown> | undefined;
let pooledConfig: Record<string, unknown> | undefined;

// 隔离路径 + 桩掉安装链路的外部依赖（下载、配置写入、连接池、uv）
mock.module('../src/util/paths.js', () => ({
  getMcpServersDir: () => serversDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

/** downloadMcp 桩：创建商品目录并写入 mcp.json */
mock.module('../src/marketplace/downloader.js', () => ({
  downloadMcp: async () => {
    fs.mkdirSync(serversDir, { recursive: true });
    const dir = path.join(serversDir, 'my-app');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'mcp.json'),
      JSON.stringify({
        type: 'stdio',
        command: 'uv',
        args: ['run', '--directory', '${SERVERS_DIR}/my-app', 'my-app'],
        agentApp: true,
        supportedUI: ['desktop', 'mobile'],
      })
    );
    return dir;
  },
}));

mock.module('../src/mcp/config.js', () => ({
  saveMcpServer: (_name: string, config: Record<string, unknown>) => {
    savedConfig = config;
  },
  deleteMcpServer: () => {},
}));

mock.module('../src/mcp/pool.js', () => ({
  addServer: async (_name: string, config: Record<string, unknown>) => {
    pooledConfig = config;
  },
  removeServer: async () => {},
}));

mock.module('../src/util/uv-runtime.js', () => ({
  detectUv: async () => ({ ok: true, version: 'test', source: 'test' }),
  syncDeps: async () => {},
}));

import { installMcp } from '../src/marketplace/mcp-installer.js';

/** 造一个 agentApp 商品的清单条目 */
function makeAppEntry(): McpMarketplaceEntry {
  return McpMarketplaceEntrySchema.parse({
    name: '我的应用',
    description: 'desc',
    author: 'a',
    homepage: 'https://example.com',
    path: 'mcp/my-app',
    logo: 'icon.png',
    runtime: 'uv',
    agentApp: true,
  });
}

describe('McpMarketplaceEntrySchema agentApp 字段', () => {
  it('parses and preserves agentApp marker', () => {
    const entry = makeAppEntry();
    expect(entry.agentApp).toBe(true);
  });

  it('keeps agentApp absent for plain MCP entries', () => {
    const entry = McpMarketplaceEntrySchema.parse({
      name: 'Notion',
      description: 'desc',
      author: 'a',
      homepage: 'https://example.com',
      path: 'mcp/notion',
    });
    expect(entry.agentApp).toBeUndefined();
  });
});

describe('installMcp agentApp passthrough', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-install-test-'));
    serversDir = path.join(tempDir, 'servers');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('carries agentApp / supportedUI into saved config and pool', async () => {
    await installMcp(makeAppEntry());

    for (const config of [savedConfig, pooledConfig]) {
      expect(config).toBeDefined();
      expect(config!.agentApp).toBe(true);
      expect(config!.supportedUI).toEqual(['desktop', 'mobile']);
      expect((config!.args as string[])[2]).toContain(serversDir);
    }
  });
});
