/**
 * @fileoverview Tests for Cloudflare Tunnel integration.
 *
 * Covers two layers:
 * - Tunnel-service core (state machine, spawn, URL parsing)
 * - Tunnel REST API router (POST /start, POST /stop, GET /status)
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
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import { EventEmitter } from 'node:events';
import * as realChildProcess from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

// --- Mocks (paths are relative from tests/ to src/) ---

let tempDir: string;
let cloudflaredBinPath: string;
let PORT: number;

mock.module('../src/util/paths.js', () => ({
  getConfigDir: () => path.dirname(cloudflaredBinPath),
  getCloudflaredBinPath: () => cloudflaredBinPath,
}));

const tunnelLogs: Array<{ tag: string; message: string; data?: unknown }> = [];

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: (tag: string, message: string, data?: unknown) => {
      tunnelLogs.push({ tag, message, data });
    },
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

mock.module('../src/server/index.js', () => ({
  startServer: mock(() => Promise.resolve()),
  httpServer: {
    address: () => ({ port: PORT, family: 'IPv4', address: '127.0.0.1' }),
  },
}));

/**
 * Fake ChildProcess that simulates cloudflared output.
 * Emits the tunnel URL on stderr after a configurable delay when one is given.
 * Records kill signals and can be told to ignore SIGTERM or all kills.
 */
interface FakeChild extends ChildProcess {
  emitLine: (line: string) => void;
  killSignals: string[];
}

function createFakeChildProcess(
  url: string | null,
  delayMs = 50,
  opts: { ignoreSigTerm?: boolean; ignoreKill?: boolean } = {}
): FakeChild {
  const emitter = new EventEmitter() as FakeChild;

  const stderr = new EventEmitter();
  const stdout = new EventEmitter();

  emitter.stderr = stderr;
  emitter.stdout = stdout;
  emitter.killSignals = [];

  emitter.kill = mock((signal?: string) => {
    emitter.killSignals.push(signal ?? 'SIGTERM');
    if (opts.ignoreKill) return true;
    if (opts.ignoreSigTerm && signal === 'SIGTERM') return true;
    emitter.emit('exit', null);
    return true;
  });

  emitter.emitLine = (line: string) => {
    stderr.emit('data', Buffer.from(line));
  };

  if (url) {
    setTimeout(() => {
      emitter.emitLine(
        `INF |  Your quick Tunnel has been created! Visit it at ${url}`
      );
    }, delayMs);
  }

  return emitter;
}

let spawnImpl: (...args: unknown[]) => ChildProcess = () =>
  createFakeChildProcess(null);

mock.module('node:child_process', () => ({
  ...realChildProcess,
  spawn: (...args: unknown[]) => spawnImpl(...args),
}));

// Import after mocks are set up
import {
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  _resetState,
  _timings,
} from '../src/server/services/tunnel-service.js';
import { createTunnelRouter } from '../src/server/routers/tunnel.js';

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

describe('Cloudflare Tunnel Integration', () => {
  let app: Express;
  let httpServer: Server;
  let BASE_URL: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tunnel-test-'));
    cloudflaredBinPath = path.join(tempDir, 'bin', 'cloudflared');

    fs.mkdirSync(path.dirname(cloudflaredBinPath), { recursive: true });
    fs.writeFileSync(cloudflaredBinPath, 'fake-binary');

    app = express();
    app.use(express.json());
    app.use('/api/tunnel', createTunnelRouter());

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  afterAll(() => {
    httpServer.close();
    rmTempDir(tempDir);
  });

  beforeEach(() => {
    _resetState();
    tunnelLogs.length = 0;
    spawnImpl = () => createFakeChildProcess(null);
  });

  // ================================================================
  // - Tunnel-service core logic
  // ================================================================
  describe('Tunnel Service', () => {
    it('startTunnel throws if cloudflared binary is missing', async () => {
      fs.unlinkSync(cloudflaredBinPath);

      await expect(startTunnel(3000)).rejects.toThrow(
        'cloudflared binary not found'
      );

      fs.writeFileSync(cloudflaredBinPath, 'fake-binary');
    });

    it('startTunnel returns URL from cloudflared stderr', async () => {
      const fakeUrl = 'https://test-tunnel.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 50);
      spawnImpl = () => fake;

      const url = await startTunnel(3000);
      expect(url).toBe(fakeUrl);
      expect(getTunnelStatus().status).toBe('running');
      expect(getTunnelStatus().url).toBe(fakeUrl);
    });

    it('startTunnel returns existing URL when already running', async () => {
      const fakeUrl = 'https://already-running.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 50);
      spawnImpl = () => fake;

      const url1 = await startTunnel(3000);
      const url2 = await startTunnel(3000);
      expect(url1).toBe(fakeUrl);
      expect(url2).toBe(fakeUrl);
    });

    it('startTunnel rejects when already starting', async () => {
      const fake = createFakeChildProcess(null);
      spawnImpl = () => fake;

      const promise = startTunnel(3000);

      // Give the event loop a tick so the state transitions to 'starting'
      await new Promise((r) => setTimeout(r, 10));

      await expect(startTunnel(3000)).rejects.toThrow(
        'Tunnel is already starting'
      );

      // Clean up: unblock the stuck promise
      fake.emit('exit', 1);
      await promise.catch(() => {});
    });

    it('stopTunnel resets state to stopped', async () => {
      const fakeUrl = 'https://to-be-stopped.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 50);
      spawnImpl = () => fake;

      await startTunnel(3000);
      expect(getTunnelStatus().status).toBe('running');

      await stopTunnel();
      expect(getTunnelStatus().status).toBe('stopped');
      expect(getTunnelStatus().url).toBeNull();
    });

    it('stopTunnel is a no-op when already stopped', async () => {
      await expect(stopTunnel()).resolves.toBeUndefined();
    });

    it('process exit resets state to stopped', async () => {
      const fakeUrl = 'https://exit-test.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 50);
      spawnImpl = () => fake;

      await startTunnel(3000);
      expect(getTunnelStatus().status).toBe('running');

      fake.emit('exit', 1);
      expect(getTunnelStatus().status).toBe('stopped');
    });

    it('spawn error is reflected in tunnel state', async () => {
      const fake = new EventEmitter() as ChildProcess;
      fake.stderr = new EventEmitter();
      fake.stdout = new EventEmitter();
      fake.kill = mock();

      spawnImpl = () => fake;

      setTimeout(
        () => fake.emit('error', new Error('spawn ENOENT')),
        10
      );

      await expect(startTunnel(3000)).rejects.toThrow('spawn ENOENT');
      expect(getTunnelStatus().status).toBe('error');
    });

    it('getTunnelStatus returns an independent snapshot', () => {
      const s1 = getTunnelStatus();
      const s2 = getTunnelStatus();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
      expect(s1.health).toBe('unknown');
    });

    it('late events from an old run do not touch the new run', async () => {
      const fakeA = createFakeChildProcess(
        'https://old-run.trycloudflare.com',
        10
      );
      spawnImpl = () => fakeA;
      await startTunnel(3000);
      fakeA.emit('exit', 0);
      expect(getTunnelStatus().status).toBe('stopped');

      const fakeB = createFakeChildProcess(
        'https://new-run.trycloudflare.com',
        10
      );
      spawnImpl = () => fakeB;
      await startTunnel(3000);
      expect(getTunnelStatus().status).toBe('running');

      fakeA.emitLine(
        'INF |  trailing noise from the old run https://ghost-url.trycloudflare.com'
      );
      fakeA.emit('exit', 1);

      expect(getTunnelStatus().status).toBe('running');
      expect(getTunnelStatus().url).toBe('https://new-run.trycloudflare.com');
    });

    it('edge connection reports drive the health field with a grace period', async () => {
      _timings.edgeGraceMs = 50;
      const fake = createFakeChildProcess(
        'https://health-track.trycloudflare.com',
        10
      );
      spawnImpl = () => fake;
      await startTunnel(3000);

      expect(getTunnelStatus().health).toBe('unknown');
      fake.emitLine('INF |  Registered tunnel connection connIndex=0');
      expect(getTunnelStatus().health).toBe('healthy');

      fake.emitLine('INF |  Unregistered tunnel connection connIndex=0');
      expect(getTunnelStatus().health).toBe('healthy');

      await new Promise((r) => setTimeout(r, 80));
      expect(getTunnelStatus().health).toBe('unhealthy');

      fake.emitLine('INF |  Registered tunnel connection connIndex=1');
      expect(getTunnelStatus().health).toBe('healthy');
    });

    it('stop escalates to SIGKILL when SIGTERM is ignored', async () => {
      _timings.stopGraceMs = 50;
      const fake = createFakeChildProcess(
        'https://escalate-me.trycloudflare.com',
        10,
        { ignoreSigTerm: true }
      );
      spawnImpl = () => fake;
      await startTunnel(3000);

      await stopTunnel();

      expect(fake.killSignals).toEqual(['SIGTERM', 'SIGKILL']);
      expect(getTunnelStatus().status).toBe('stopped');
    });

    it('logs the output tail when cloudflared exits before the URL', async () => {
      const fake = createFakeChildProcess(null);
      spawnImpl = () => fake;

      const promise = startTunnel(3000);
      fake.emitLine('ERR |  failed to connect to the edge');
      fake.emitLine('ERR |  another diagnostic line');
      fake.emit('exit', 1);

      await expect(promise).rejects.toThrow('before URL was found');
      const tail = tunnelLogs.find(
        (l) => l.message === 'Output tail before exit'
      );
      expect(tail?.data).toContain('failed to connect to the edge');
      expect(tail?.data).toContain('another diagnostic line');
    });

    it('rejects on timeout and finishes the run', async () => {
      _timings.startTimeoutMs = 50;
      _timings.stopGraceMs = 20;
      _timings.killWaitMs = 20;
      const fake = createFakeChildProcess(null, 50, { ignoreSigTerm: true });
      spawnImpl = () => fake;

      await expect(startTunnel(3000)).rejects.toThrow(
        'Timeout waiting for tunnel URL'
      );
      await new Promise((r) => setTimeout(r, 60));

      expect(getTunnelStatus().status).toBe('error');
      expect(getTunnelStatus().error).toBe('Timeout waiting for tunnel URL');
    });
  });

  // ================================================================
  // - Tunnel REST API
  // ================================================================
  describe('Tunnel REST API', () => {
    it('POST /start returns 202 and starts tunnel', async () => {
      const fakeUrl = 'https://api-test.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 300);
      spawnImpl = () => fake;

      const res = await fetch(`${BASE_URL}/api/tunnel/start`, {
        method: 'POST',
      });
      expect(res.status).toBe(202);
      const data = (await res.json()) as { status: string };
      expect(data.status).toBe('starting');

      await new Promise((r) => setTimeout(r, 400));

      const statusRes = await fetch(`${BASE_URL}/api/tunnel/status`);
      const status = (await statusRes.json()) as {
        status: string;
        url: string;
      };
      expect(status.status).toBe('running');
      expect(status.url).toBe(fakeUrl);
    });

    it('POST /start returns running URL when already running', async () => {
      const fakeUrl = 'https://already-api.trycloudflare.com';
      const fake = createFakeChildProcess(fakeUrl, 50);
      spawnImpl = () => fake;

      await startTunnel(3000);

      const res = await fetch(`${BASE_URL}/api/tunnel/start`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string; url: string };
      expect(data.status).toBe('running');
      expect(data.url).toBe(fakeUrl);
    });

    it('POST /stop returns 200', async () => {
      const res = await fetch(`${BASE_URL}/api/tunnel/stop`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('GET /status returns current state with health and online devices', async () => {
      const res = await fetch(`${BASE_URL}/api/tunnel/status`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        status: string;
        url: string | null;
        error: string | null;
        health: string;
        onlineDevices: unknown[];
      };
      expect(data.status).toBe('stopped');
      expect(data.url).toBeNull();
      expect(data.error).toBeNull();
      expect(data.health).toBe('unknown');
      expect(data.onlineDevices).toEqual([]);
    });
  });
});
