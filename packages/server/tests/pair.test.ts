/**
 * @fileoverview Tests for pair router.
 *
 * Covers POST /api/pair endpoint: verifies response shape and that
 * broadcastToAll is called with the correct message payload.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as net from 'node:net';

const mockBroadcastToAll = vi.fn();

vi.mock('../src/server/websocket-server.js', () => ({
  broadcastToAll: (...args: unknown[]) => mockBroadcastToAll(...args),
}));

vi.mock('../src/util/logger.js', () => ({
  Logger: {
    log: vi.fn(),
    initialize: vi.fn(),
    setEnabled: vi.fn(),
    setSessionManagers: vi.fn(),
  },
}));

import { createPairRouter } from '../src/server/routers/pair.js';

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

describe('Pair Router', () => {
  let app: Express;
  let httpServer: Server;
  let BASE_URL: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/pair', createPairRouter());

    const port = await findAvailablePort();
    BASE_URL = `http://localhost:${port}`;

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(port, '0.0.0.0', () => resolve());
    });
  });

  afterAll(() => {
    httpServer.close();
  });

  it('POST / with device identity returns ok and broadcasts pair_request', async () => {
    mockBroadcastToAll.mockClear();

    const res = await fetch(`${BASE_URL}/api/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName: 'iPhone 15 Pro',
        deviceId: 'dev-123',
        deviceType: 'mobile',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    expect(mockBroadcastToAll).toHaveBeenCalledTimes(1);
    const event = mockBroadcastToAll.mock.calls[0][0] as {
      type: string;
      deviceName: string;
      deviceId?: string;
      deviceType?: string;
      timestamp: number;
    };
    expect(event.type).toBe('pair_request');
    expect(event.deviceName).toBe('iPhone 15 Pro');
    expect(event.deviceId).toBe('dev-123');
    expect(event.deviceType).toBe('mobile');
    expect(typeof event.timestamp).toBe('number');
  });

  it('POST / without body defaults deviceName to Unknown', async () => {
    mockBroadcastToAll.mockClear();

    const res = await fetch(`${BASE_URL}/api/pair`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);

    const event = mockBroadcastToAll.mock.calls[0][0] as {
      deviceName: string;
    };
    expect(event.deviceName).toBe('Unknown');
  });
});
