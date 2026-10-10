/**
 * @fileoverview MCP 列表投影测试
 * 覆盖 /api/mcp 的字段投影：安装 meta 的显示字段与 instructions 与工具明细透出，
 * 显示信息在 meta 缺失时回退 config，连接类型按状态与配置推导，
 * logoUrl 走本地图标产出链，本地命中出挂哈希的相对地址，缺失回退远程网址。
 */
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时服务目录 */
let serversDir: string;

mock.module('../src/util/paths.js', () => ({
  getMcpServersDir: () => serversDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
  },
}));

import { projectMcpServerEntry } from '../src/server/routers/mcp.js';
import { getFileHash } from '../src/util/asset-hash.js';
import type { McpServerEntry } from '../src/mcp/types.js';

/** 造一个最小可投影的池条目，字段按用例覆盖 */
function makeEntry(overrides: Partial<McpServerEntry> = {}): McpServerEntry {
  return {
    name: 'notion',
    config: {},
    status: 'connected',
    tools: [
      { id: 'mcp:notion:search', name: 'search', description: '搜索页面' },
    ],
    ...overrides,
  };
}

describe('projectMcpServerEntry', () => {
  beforeAll(() => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-proj-test-'));
    serversDir = path.join(tempDir, 'servers');
  });

  afterAll(() => {
    fs.rmSync(path.dirname(serversDir), { recursive: true, force: true });
  });

  it('projects install meta, instructions and tool details', () => {
    const info = projectMcpServerEntry(
      makeEntry({
        instructions: 'Use this server to manage notes.',
        meta: {
          displayName: 'Notion',
          author: 'Notion',
          logoUrl: 'https://example.com/logo.png',
        },
      })
    );

    expect(info.displayName).toBe('Notion');
    expect(info.author).toBe('Notion');
    expect(info.logoUrl).toBe('https://example.com/logo.png');
    expect(info.instructions).toBe('Use this server to manage notes.');
    expect(info.tools).toEqual([{ name: 'search', description: '搜索页面' }]);
    expect(info.toolCount).toBe(1);
  });

  it('produces a hashed local url when the meta logo resolves locally', () => {
    const dir = path.join(serversDir, 'figma');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'logo.svg'), '<svg/>');

    const info = projectMcpServerEntry(
      makeEntry({
        name: 'figma',
        meta: { logoFile: 'logo.svg', logoUrl: 'https://example.com/logo.svg' },
      })
    );

    expect(info.logoUrl).toBe(
      `/api/mcp/figma/logo?h=${getFileHash(path.join(dir, 'logo.svg'))}`
    );
  });

  it('falls back to config description when meta is absent', () => {
    const info = projectMcpServerEntry(
      makeEntry({ config: { description: 'from config' } })
    );

    expect(info.displayName).toBeUndefined();
    expect(info.description).toBe('from config');
  });

  it('derives connection type from status and config', () => {
    expect(projectMcpServerEntry(makeEntry()).connectionType).toBe('stdio');
    expect(
      projectMcpServerEntry(
        makeEntry({ config: { url: 'https://mcp.example.com' } })
      ).connectionType
    ).toBe('http');
    expect(
      projectMcpServerEntry(makeEntry({ status: 'needs_auth' })).connectionType
    ).toBe('oauth');
  });
});
