/**
 * @fileoverview MCP 商城全部后端测试
 *
 * 覆盖：
 * - McpMarketplaceEntrySchema 校验
 * - saveMcpServer / deleteMcpServer，配置读写
 * - addServer / removeServer，连接池运行时增删
 * - installMcp / uninstallMcp，安装/卸载编排 + ${SERVERS_DIR} 替换 + 回滚
 *
 * 所有测试在同一个文件里，共享同一套 mock，避免 mock.module 跨文件冲突。
 *
 * Mock 策略：
 * - paths.ts → 指向临时目录
 * - logger.ts → 静音
 * - loader.ts → connectOne 返回可控结果，给 pool 测试用
 * - downloader.ts → downloadMcp 在临时目录造文件，给 installer 测试用
 * 其余模块 pool.ts / config.ts / mcp-installer.ts 使用真实实现。
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpMarketplaceEntrySchema } from '@persona/shared';
import type { McpMarketplaceEntry } from '@persona/shared';

// ─── 临时目录 ───────────────────────────────────────────────

let tempDir: string;
let configPath: string;
let serversDir: string;

// ─── Mock 控制 ──────────────────────────────────────────────

/** 控制 connectOne 的返回值，pool 测试用 */
let mockConnectResult: Record<string, unknown>;

/** 控制 downloadMcp 造的 mcp.json 内容，installer 测试用，null 表示不写 */
let mockMcpJsonContent: Record<string, unknown> | null;

/** 控制 downloadMcp 是否模拟 CDN 返回空文件，installer 测试用 */
let mockDownloadEmpty: boolean;

mock.module('../src/util/paths.js', () => ({
  getMcpConfigPath: () => configPath,
  getMcpServersDir: () => serversDir,
  getOAuthTokensPath: () => path.join(tempDir, 'tokens.json'),
  getSkillsDir: () => path.join(tempDir, 'skills'),
  getRuntimesDir: () => path.join(tempDir, 'runtimes'),
  getUvBinPath: () => path.join(tempDir, 'runtimes', 'uv'),
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

mock.module('../src/mcp/loader.js', () => ({
  connectAllServers: async () => [],
  connectOne: async (name: string) => ({
    name,
    ...mockConnectResult,
  }),
}));

mock.module('../src/marketplace/downloader.js', () => ({
  downloadMcp: async (entry: McpMarketplaceEntry) => {
    const folderName = entry.path.split('/').pop()!;
    const dir = path.join(serversDir, folderName);
    // 模拟 CDN 数据 API 返回空文件列表
    if (mockDownloadEmpty) {
      throw new Error(
        `未找到 ${entry.path} 下的文件，商城数据可能正在同步中，请稍后再试`
      );
    }
    // 总是创建目录，和真实 downloadPackage 行为一致
    fs.mkdirSync(dir, { recursive: true });
    // mockMcpJsonContent 为 null 时只造目录不写 mcp.json，模拟解析失败
    if (mockMcpJsonContent !== null) {
      fs.writeFileSync(
        path.join(dir, 'mcp.json'),
        JSON.stringify(mockMcpJsonContent)
      );
    }
    return dir;
  },
  // downloader.ts 里的其他导出，给 marketplace.test.ts 用，同进程不冲突
  downloadSkill: async () => '',
  downloadPackage: async () => '',
}));

mock.module('../src/util/uv-runtime.js', () => ({
  detectUv: () => ({ ok: true, source: 'app', path: '/fake/uv', version: 'uv 0.7' }),
  syncDeps: async () => {},
  invalidateUvCache: () => {},
  getUvAssetName: () => 'uv-aarch64-apple-darwin.tar.gz',
}));

// ─── 导入被测模块 ───────────────────────────────────────────

import { saveMcpServer, deleteMcpServer } from '../src/mcp/config.js';
import {
  addServer,
  removeServer,
  listMcpServers,
  getMcpServer,
} from '../src/mcp/pool.js';
import { installMcp, uninstallMcp } from '../src/marketplace/mcp-installer.js';

// ─── 辅助 ───────────────────────────────────────────────────

function makeEntry(folder = 'test-mcp'): McpMarketplaceEntry {
  return {
    name: 'Test MCP',
    description: 'desc',
    author: 'a',
    homepage: 'https://example.com',
    path: `mcp/${folder}`,
    logo: 'logo.svg',
  };
}

async function cleanPool() {
  const servers = listMcpServers();
  for (const s of servers) {
    await removeServer(s.name);
  }
}

// ─── 生命周期 ───────────────────────────────────────────────

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-test-'));
  configPath = path.join(tempDir, 'mcp.json');
  serversDir = path.join(tempDir, 'servers');
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await cleanPool();
  if (fs.existsSync(configPath)) fs.rmSync(configPath);
  if (fs.existsSync(serversDir)) fs.rmSync(serversDir, { recursive: true });

  // 默认：connectOne 成功连接
  mockConnectResult = {
    connection: { name: '', tools: [], disconnect: async () => {} },
    tools: [],
    serverConn: { disconnect: async () => {} },
  };
  // 默认：downloadMcp 造一个可用的 mcp.json
  mockMcpJsonContent = { type: 'stdio', command: 'echo', args: ['hi'] };
  mockDownloadEmpty = false;
});

// ═══════════════════════════════════════════════════════════
// Schema 校验
// ═══════════════════════════════════════════════════════════

describe('McpMarketplaceEntrySchema', () => {
  it('accepts a valid entry with logo', () => {
    const result = McpMarketplaceEntrySchema.safeParse({
      name: 'Test',
      description: 'd',
      author: 'a',
      homepage: 'https://example.com',
      path: 'mcp/test',
      logo: 'logo.svg',
    });
    expect(result.success).toBe(true);
  });

  it('accepts entry without logo (optional)', () => {
    const result = McpMarketplaceEntrySchema.safeParse({
      name: 'Test',
      description: 'd',
      author: 'a',
      homepage: 'https://example.com',
      path: 'mcp/test',
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 配置读写：saveMcpServer / deleteMcpServer
// ═══════════════════════════════════════════════════════════

describe('saveMcpServer', () => {
  it('writes a new server config to mcp.json', () => {
    saveMcpServer('srv-a', { type: 'stdio', command: 'npx', args: [] });
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, { command: string }> };
    expect(content.mcpServers['srv-a'].command).toBe('npx');
  });

  it('overwrites an existing server config', () => {
    saveMcpServer('srv-a', { type: 'stdio', command: 'old', args: [] });
    saveMcpServer('srv-a', { type: 'stdio', command: 'new', args: [] });
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, { command: string }> };
    expect(content.mcpServers['srv-a'].command).toBe('new');
  });

  it('preserves other servers when writing one', () => {
    saveMcpServer('srv-a', { type: 'stdio', command: 'a', args: [] });
    saveMcpServer('srv-b', { type: 'stdio', command: 'b', args: [] });
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, unknown> };
    expect(content.mcpServers['srv-a']).toBeDefined();
    expect(content.mcpServers['srv-b']).toBeDefined();
  });
});

describe('deleteMcpServer', () => {
  it('removes an existing server config', () => {
    saveMcpServer('srv', { type: 'stdio', command: 'x', args: [] });
    deleteMcpServer('srv');
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, unknown> };
    expect(content.mcpServers['srv']).toBeUndefined();
  });

  it('is idempotent when server does not exist', () => {
    deleteMcpServer('nonexistent');
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it('preserves other servers when deleting one', () => {
    saveMcpServer('keep', { type: 'stdio', command: 'k', args: [] });
    saveMcpServer('del', { type: 'stdio', command: 'd', args: [] });
    deleteMcpServer('del');
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, unknown> };
    expect(content.mcpServers['keep']).toBeDefined();
    expect(content.mcpServers['del']).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════
// 连接池：addServer / removeServer
// ═══════════════════════════════════════════════════════════

describe('addServer', () => {
  it('registers a server and connects successfully', async () => {
    const tools = [{ id: 't1', name: 'tool1', description: 'd' }];
    mockConnectResult = {
      connection: { name: '', tools: [], disconnect: async () => {} },
      tools,
      serverConn: { disconnect: async () => {} },
    };

    await addServer('srv', { type: 'stdio', command: 'echo', args: [] });

    const entry = getMcpServer('srv');
    expect(entry).toBeDefined();
    expect(entry?.status).toBe('connected');
    expect(entry?.tools).toHaveLength(1);
  });

  it('throws when adding a server that already exists', async () => {
    await addServer('dup', { type: 'stdio', command: 'echo', args: [] });
    await expect(
      addServer('dup', { type: 'stdio', command: 'echo', args: [] })
    ).rejects.toThrow(/already exists/);
  });

  it('sets status to disconnected when connection fails', async () => {
    mockConnectResult = { tools: [], error: 'Connection refused' };

    await addServer('fail', {
      type: 'stdio',
      command: 'nonexistent',
      args: [],
    });

    const entry = getMcpServer('fail');
    expect(entry?.status).toBe('disconnected');
    expect(entry?.error).toBe('Connection refused');
  });

  it('sets status to needs_auth when server requires OAuth', async () => {
    mockConnectResult = {
      tools: [],
      needsAuth: true,
      oauthUrl: 'https://example.com/auth',
      serverConn: { disconnect: async () => {} },
    };

    await addServer('oauth', {
      type: 'streamable_http',
      url: 'https://example.com/mcp',
    });

    const entry = getMcpServer('oauth');
    expect(entry?.status).toBe('needs_auth');
    expect(entry?.oauthUrl).toBe('https://example.com/auth');
  });
});

describe('removeServer', () => {
  it('removes a server from the pool', async () => {
    await addServer('rm', { type: 'stdio', command: 'echo', args: [] });
    expect(getMcpServer('rm')).toBeDefined();

    await removeServer('rm');
    expect(getMcpServer('rm')).toBeUndefined();
  });

  it('is idempotent when server does not exist', async () => {
    await removeServer('nonexistent');
    expect(getMcpServer('nonexistent')).toBeUndefined();
  });

  it('allows re-adding after removal', async () => {
    await addServer('recycle', { type: 'stdio', command: 'echo', args: [] });
    await removeServer('recycle');

    await addServer('recycle', { type: 'stdio', command: 'echo', args: [] });
    expect(getMcpServer('recycle')?.status).toBe('connected');
  });
});

// ═══════════════════════════════════════════════════════════
// 安装/卸载编排：installMcp / uninstallMcp
// ═══════════════════════════════════════════════════════════

describe('installMcp', () => {
  it('downloads, reads mcp.json, saves config, and adds to pool', async () => {
    await installMcp(makeEntry());

    // 配置已写入
    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, { command: string }> };
    expect(content.mcpServers['test-mcp']).toBeDefined();

    // 池里有
    expect(getMcpServer('test-mcp')).toBeDefined();
    expect(getMcpServer('test-mcp')?.status).toBe('connected');
  });

  it('replaces ${SERVERS_DIR} placeholder with absolute path', async () => {
    mockMcpJsonContent = {
      type: 'stdio',
      command: 'uv',
      args: ['run', '--directory', '${SERVERS_DIR}/test-mcp', 'test-mcp'],
    };

    await installMcp(makeEntry());

    const content = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    ) as { mcpServers: Record<string, { args: string[] }> };
    const savedArgs = content.mcpServers['test-mcp'].args;
    expect(savedArgs[2]).toBe(path.join(serversDir, 'test-mcp'));
    expect(savedArgs[2]).not.toContain('${SERVERS_DIR}');
  });

  it('rolls back when mcp.json is unparseable', async () => {
    // downloadMcp 会造目录但不写合法的 mcp.json
    mockMcpJsonContent = null;

    await expect(installMcp(makeEntry())).rejects.toThrow(/无法解析/);

    // 回滚：目录应被删除
    expect(fs.existsSync(path.join(serversDir, 'test-mcp'))).toBe(false);
    // 不应写入配置
    expect(getMcpServer('test-mcp')).toBeUndefined();
  });

  it('rolls back when mcp.json does not exist', async () => {
    mockMcpJsonContent = null;

    await expect(installMcp(makeEntry())).rejects.toThrow(/无法解析/);
    expect(fs.existsSync(path.join(serversDir, 'test-mcp'))).toBe(false);
  });

  it('fails with sync message when CDN returns no files', async () => {
    mockDownloadEmpty = true;

    await expect(installMcp(makeEntry())).rejects.toThrow(/正在同步/);
    expect(getMcpServer('test-mcp')).toBeUndefined();
  });
});

describe('uninstallMcp', () => {
  it('removes from pool, deletes config, and deletes directory', async () => {
    // 先安装
    await installMcp(makeEntry());
    expect(getMcpServer('test-mcp')).toBeDefined();

    // 卸载
    await uninstallMcp('test-mcp');

    // 池里没了
    expect(getMcpServer('test-mcp')).toBeUndefined();

    // 配置里没了
    if (fs.existsSync(configPath)) {
      const content = JSON.parse(
        fs.readFileSync(configPath, 'utf8')
      ) as { mcpServers: Record<string, unknown> };
      expect(content.mcpServers['test-mcp']).toBeUndefined();
    }

    // 目录删了
    expect(fs.existsSync(path.join(serversDir, 'test-mcp'))).toBe(false);
  });

  it('succeeds even when directory does not exist', async () => {
    await uninstallMcp('never-installed');
    // 不抛异常就算通过
  });
});
