/**
 * @fileoverview MCP 整池收尾测试
 * 覆盖遍历全部服务、单个断开失败不影响其他服务、
 * 断开干净的服务从清账记录除名而失败的保留、空池调用是无操作。
 */
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时 mcp 目录，清账记录落在里面 */
let mcpDir: string;

mock.module('../src/util/paths.js', () => ({
  getMcpDir: () => mcpDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
  },
}));

/** 断开失败的名单，测试按用例改写 */
let failDisconnects = new Set<string>();
const disconnectCalls: string[] = [];

/** 造一份带断开探针的假连接结果，绕开真实 spawn */
function makeFakeResult(name: string) {
  const disconnect = () => {
    disconnectCalls.push(name);
    if (failDisconnects.has(name)) {
      return Promise.reject(new Error('disconnect boom'));
    }
    return Promise.resolve();
  };
  return {
    name,
    connection: { name, tools: [], disconnect },
    serverConn: { name, tools: [], instructions: undefined, disconnect },
  };
}

mock.module('../src/mcp/config.js', () => ({
  loadMcpConfig: () =>
    new Map([
      ['alpha', { command: 'uv', agentApp: true }],
      ['beta', { command: 'uv', agentApp: true }],
      ['gamma', { url: 'https://example.com' }],
    ]),
}));

mock.module('../src/mcp/loader.js', () => ({
  connectAllServers: async (configs: Map<string, unknown>) =>
    Array.from(configs.keys()).map((name) => makeFakeResult(name)),
  connectOne: async (name: string) => makeFakeResult(name),
}));

import { initMcpPool, shutdownMcpPool, listMcpServers } from '../src/mcp/pool.js';
import { recordAppPid, readAppPidEntries } from '../src/mcp/app-pid-ledger.js';

describe('shutdownMcpPool', () => {
  beforeAll(() => {
    mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-shutdown-test-'));
  });

  afterAll(() => {
    fs.rmSync(mcpDir, { recursive: true, force: true });
  });

  it('disconnects every pooled server and empties the pool', async () => {
    await initMcpPool();
    expect(listMcpServers().length).toBe(3);

    await shutdownMcpPool();

    expect([...new Set(disconnectCalls)].sort()).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(listMcpServers().length).toBe(0);
  });

  it('keeps ledger record for failed disconnect while reaping the rest', async () => {
    failDisconnects = new Set(['beta']);
    await initMcpPool();
    recordAppPid('beta', 4194304, { command: 'uv' });

    await shutdownMcpPool();

    expect(readAppPidEntries().map((e) => e.name)).toEqual(['beta']);
  });

  it('is a no-op on an already empty pool', async () => {
    disconnectCalls.length = 0;

    await shutdownMcpPool();

    expect(disconnectCalls.length).toBe(0);
  });
});
