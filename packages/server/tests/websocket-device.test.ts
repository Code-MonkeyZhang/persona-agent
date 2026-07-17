/**
 * @fileoverview Tests for WebSocket device identity (register, online/offline broadcast).
 *
 * Uses real WebSocket connections against a test server to verify the full
 * device registry lifecycle.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer, type Server } from 'http';
import * as net from 'node:net';
import { WebSocket, type RawData } from 'ws';

vi.mock('../src/util/logger.js', () => ({
  Logger: {
    log: vi.fn(),
    initialize: vi.fn(),
    setEnabled: vi.fn(),
    setSessionManagers: vi.fn(),
  },
}));

import {
  initWebSocket,
  shutdownWebSocket,
  getOnlineDevices,
} from '../src/server/websocket-server.js';

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

/**
 * 测试用的 WS 客户端包装，缓冲所有收到的消息以避免竞态。
 * 消息处理器在连接建立前同步挂载，确保不丢失服务器首条消息。
 */
class TestClient {
  readonly ws: WebSocket;
  private buffer: Record<string, unknown>[] = [];
  private waiters: Array<{
    type: string;
    resolve: (msg: Record<string, unknown>) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data: RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        this.dispatch(msg);
      } catch {
        // ignore parse errors
      }
    });
  }

  private dispatch(msg: Record<string, unknown>): void {
    const idx = this.waiters.findIndex((w) => w.type === msg.type);
    if (idx >= 0) {
      const waiter = this.waiters[idx];
      this.waiters.splice(idx, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } else {
      this.buffer.push(msg);
    }
  }

  /** 等待指定类型的消息，优先从缓冲区取 */
  waitFor(type: string, timeout = 3000): Promise<Record<string, unknown>> {
    const idx = this.buffer.findIndex((m) => m.type === type);
    if (idx >= 0) {
      return Promise.resolve(this.buffer.splice(idx, 1)[0]);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const widx = this.waiters.findIndex((w) => w.type === type);
        if (widx >= 0) this.waiters.splice(widx, 1);
        reject(new Error(`Timeout waiting for "${type}"`));
      }, timeout);
      this.waiters.push({ type, resolve, timer });
    });
  }

  send(msg: object): void {
    this.ws.send(JSON.stringify(msg));
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.on('close', () => resolve());
      this.ws.close();
    });
  }
}

/** 连接并等待服务器 'connected' 确认 */
function connectClient(url: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const client = new TestClient(url);
    client.ws.on('error', reject);
    client.waitFor('connected').then(() => resolve(client)).catch(reject);
  });
}

describe('WebSocket Device Identity', () => {
  let httpServer: Server;
  let wsUrl: string;

  beforeAll(async () => {
    const port = await findAvailablePort();
    httpServer = createServer();
    initWebSocket(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(port, '0.0.0.0', () => resolve());
    });
    wsUrl = `ws://localhost:${port}/ws`;
  });

  afterAll(async () => {
    shutdownWebSocket();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('device_online broadcast when second device registers', async () => {
    const clientA = await connectClient(wsUrl);
    clientA.send({
      type: 'register',
      deviceId: 'device-a',
      deviceType: 'desktop',
      deviceName: 'My Mac',
    });

    const clientB = await connectClient(wsUrl);
    clientB.send({
      type: 'register',
      deviceId: 'device-b',
      deviceType: 'mobile',
      deviceName: 'iPhone 15',
    });

    const onlineMsg = await clientA.waitFor('device_online');
    expect(onlineMsg.device).toEqual({
      deviceId: 'device-b',
      deviceType: 'mobile',
      deviceName: 'iPhone 15',
    });

    const devices = getOnlineDevices();
    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.deviceId).sort()).toEqual([
      'device-a',
      'device-b',
    ]);

    await clientA.close();
    await clientB.close();
  });

  it('device_offline broadcast when device disconnects', async () => {
    const clientA = await connectClient(wsUrl);
    clientA.send({
      type: 'register',
      deviceId: 'observer',
      deviceType: 'desktop',
      deviceName: 'Desktop',
    });

    const clientB = await connectClient(wsUrl);
    clientB.send({
      type: 'register',
      deviceId: 'phone-1',
      deviceType: 'mobile',
      deviceName: 'Pixel 8',
    });

    await clientA.waitFor('device_online');

    await clientB.close();

    const offlineMsg = await clientA.waitFor('device_offline');
    expect(offlineMsg.deviceId).toBe('phone-1');

    const devices = getOnlineDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceId).toBe('observer');

    await clientA.close();
  });

  it('ping returns pong', async () => {
    const client = await connectClient(wsUrl);
    client.send({
      type: 'register',
      deviceId: 'pinger',
      deviceType: 'mobile',
      deviceName: 'Test Phone',
    });

    client.send({ type: 'ping' });
    const pong = await client.waitFor('pong');
    expect(pong.type).toBe('pong');

    await client.close();
  });

  it('unregistered client does not appear in online devices', async () => {
    const client = await connectClient(wsUrl);
    expect(getOnlineDevices()).toEqual([]);
    await client.close();
  });
});
