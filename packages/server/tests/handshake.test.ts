/**
 * @fileoverview Tests for the handshake route and host identity.
 *
 * Verifies the response shape, idempotency across calls, and that the
 * identity is persisted into the kv table.
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as net from 'node:net';

/** 临时测试目录 */
let tempDir: string;
/** 测试库文件路径 */
let dbPath: string;

mock.module('../src/util/paths.js', () => ({
  getDbPath: () => dbPath,
}));

import { createHandshakeRouter } from '../src/server/routers/handshake.js';
import { getDb, closeDb } from '../src/db/index.js';

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

describe('handshake', () => {
  let app: Express;
  let httpServer: Server;
  let BASE_URL: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handshake-test-'));
    dbPath = path.join(tempDir, 'persona.db');

    app = express();
    app.use('/api/handshake', createHandshakeRouter());

    const port = await findAvailablePort();
    BASE_URL = `http://localhost:${port}`;
    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(port, '0.0.0.0', () => resolve());
    });
  });

  afterAll(() => {
    httpServer.close();
    closeDb();
    rmTempDir(tempDir);
  });

  /** 响应形状含 hostId、hostName 与 version 三项 */
  it('should report host identity and version', async () => {
    const res = await fetch(`${BASE_URL}/api/handshake`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hostId: string;
      hostName: string;
      version: string;
    };
    expect(body.hostId.length).toBeGreaterThan(0);
    expect(body.hostName.length).toBeGreaterThan(0);
    expect(body.version.length).toBeGreaterThan(0);
  });

  /** 重复握手返回同一 hostId，身份幂等 */
  it('should return the same hostId across calls', async () => {
    const first = (await (await fetch(`${BASE_URL}/api/handshake`)).json()) as {
      hostId: string;
    };
    const second = (await (await fetch(`${BASE_URL}/api/handshake`)).json()) as {
      hostId: string;
    };
    expect(second.hostId).toBe(first.hostId);
  });

  /** 身份落 kv 持久化，自称名默认取 OS hostname */
  it('should persist identity into kv with os hostname', async () => {
    const body = (await (await fetch(`${BASE_URL}/api/handshake`)).json()) as {
      hostId: string;
      hostName: string;
    };
    const row = getDb()
      .query<{ value: string }, [string]>(
        'SELECT value FROM kv WHERE key = ?'
      )
      .get('host_id');
    expect(row?.value).toBe(body.hostId);
    expect(body.hostName).toBe(os.hostname());
  });
});
