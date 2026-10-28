/**
 * @file WebSocketClient 连接纪律测试。
 * mock 全局 WebSocket，覆盖在途防重、陈旧 socket 守卫、
 * 回调摘除、建立超时与退避时序、下行看门狗、重连窗口与稳定期防抖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from '@/lib/api';

// logger 依赖渲染进程的 window.api，node 环境下以空实现替身
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** 可控的 WebSocket 替身，测试手动驱动状态迁移 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  /** 测试辅助，模拟网络层完成握手 */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** 测试辅助，模拟服务端下发消息 */
  receive(msg: unknown): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function createClient(): WebSocketClient {
  return new WebSocketClient(async () => 'http://localhost:1');
}

/** 等待 urlProvider 的微任务链走完，fake timers 下用零推进触发微任务刷新 */
async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe('WebSocketClient connection discipline', () => {
  let statuses: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function trackStatus(client: WebSocketClient): void {
    client.onConnectionChange((status) => statuses.push(status));
  }

  it('reuses in-flight dial instead of opening a second socket', async () => {
    const client = createClient();
    client.connect();
    client.connect();
    await flush();

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('ignores close events from a replaced stale socket', async () => {
    const client = createClient();
    trackStatus(client);
    client.connect();
    await flush();

    const stale = MockWebSocket.instances[0];
    stale.open();
    const staleOnClose = stale.onclose;
    expect(staleOnClose).toBeTruthy();

    client.disconnect();
    client.connect();
    await flush();
    const fresh = MockWebSocket.instances[1];
    fresh.open();
    expect(statuses.at(-1)).toBe('connected');

    staleOnClose!.call(stale);
    expect(statuses.at(-1)).toBe('connected');
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('detaches handlers on disconnect so late close stays silent', async () => {
    const client = createClient();
    trackStatus(client);
    client.connect();
    await flush();

    const socket = MockWebSocket.instances[0];
    socket.open();
    client.disconnect();

    expect(socket.onclose).toBeNull();
    socket.close();
    expect(statuses).toEqual(['connecting', 'connected']);
  });

  it('treats connect timeout as failure and retries with backoff', async () => {
    const client = createClient();
    trackStatus(client);
    client.connect();
    await flush();

    // 15 秒未握手完成，超时关闭进入窗口期重连
    await vi.advanceTimersByTimeAsync(15_000);
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.CLOSED);
    expect(statuses).toContain('reconnecting');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('backs off exponentially and caps at 10 seconds', async () => {
    const client = createClient();
    client.connect();
    await flush();

    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      MockWebSocket.instances.at(-1)!.close();
      // 每轮关闭后到下一次拨号的时间差即当前退避值
      const before = MockWebSocket.instances.length;
      let waited = 0;
      while (MockWebSocket.instances.length === before && waited < 30_000) {
        await vi.advanceTimersByTimeAsync(500);
        waited += 500;
      }
      delays.push(waited);
    }

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 10_000]);
  });

  it('resets backoff after a connection stays stable for ten seconds', async () => {
    const client = createClient();
    client.connect();
    await flush();
    MockWebSocket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1_000);
    MockWebSocket.instances[1].close();
    await vi.advanceTimersByTimeAsync(2_000);

    // 第三次拨号成功并稳定存活满 10 秒，断开才算新事件，退避从基准重新起步
    MockWebSocket.instances[2].open();
    await vi.advanceTimersByTimeAsync(10_000);
    MockWebSocket.instances[2].close();

    const before = MockWebSocket.instances.length;
    let waited = 0;
    while (MockWebSocket.instances.length === before && waited < 5_000) {
      await vi.advanceTimersByTimeAsync(500);
      waited += 500;
    }
    expect(waited).toBe(1_000);
  });
});

describe('WebSocketClient downlink watchdog', () => {
  let statuses: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function trackStatus(client: WebSocketClient): void {
    client.onConnectionChange((status) => statuses.push(status));
  }

  /** 建立连接并让服务端声明保活节拍，返回当前 socket */
  async function armedClient(intervalMs?: number): Promise<MockWebSocket> {
    const client = createClient();
    trackStatus(client);
    client.connect();
    await flush();
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive({
      type: 'connected',
      clientId: 'c1',
      keepaliveIntervalMs: intervalMs,
    });
    return socket;
  }

  it('closes the connection when downlink stalls past the derived threshold', async () => {
    const socket = await armedClient(5_000);

    await vi.advanceTimersByTimeAsync(20_000);

    expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    expect(statuses).toContain('reconnecting');
  });

  it('keeps the connection alive while keepalives keep arriving', async () => {
    const socket = await armedClient(5_000);

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(5_000);
      socket.receive({ type: 'keepalive' });
    }

    expect(socket.readyState).toBe(MockWebSocket.OPEN);
    expect(statuses.at(-1)).toBe('connected');
  });

  it('stays disarmed against a server that does not announce keepalive', async () => {
    const socket = await armedClient(undefined);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(socket.readyState).toBe(MockWebSocket.OPEN);
  });
});

describe('WebSocketClient reconnect window', () => {
  let statuses: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    statuses = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function trackStatus(client: WebSocketClient): void {
    client.onConnectionChange((status) => statuses.push(status));
  }

  /** 让拨号持续失败直到重连窗口耗尽进入离线态 */
  async function exhaustWindow(client: WebSocketClient): Promise<void> {
    client.connect();
    await flush();
    for (let i = 0; i < 40 && !statuses.includes('disconnected'); i++) {
      MockWebSocket.instances.at(-1)!.close();
      await vi.advanceTimersByTimeAsync(10_000);
    }
  }

  it('enters offline when the window exhausts and keeps probing slowly', async () => {
    const client = createClient();
    trackStatus(client);
    await exhaustWindow(client);

    expect(statuses).toContain('disconnected');
    expect(statuses.filter((s) => s === 'disconnected')).toHaveLength(1);

    // 慢探测每 60 秒拨一次号，65 秒窗口内只出现一次新拨号且状态不翻
    const before = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(65_000);
    expect(MockWebSocket.instances).toHaveLength(before + 1);
    expect(statuses.at(-1)).toBe('disconnected');
  });

  it('reconnectNow from offline starts a fresh window', async () => {
    const client = createClient();
    trackStatus(client);
    await exhaustWindow(client);

    client.reconnectNow();
    await flush();

    expect(statuses.at(-1)).toBe('connecting');
    const socket = MockWebSocket.instances.at(-1)!;
    socket.open();
    socket.receive({
      type: 'connected',
      clientId: 'c1',
      keepaliveIntervalMs: 5_000,
    });
    expect(statuses.at(-1)).toBe('connected');

    // 焕新后的窗口重新计时，连接成功再断开走 1 秒基准退避
    socket.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(MockWebSocket.instances.at(-1)).not.toBe(socket);
  });

  it('does not reset the window when short-lived connections keep dropping', async () => {
    const client = createClient();
    trackStatus(client);
    client.connect();
    await flush();

    // 半死服务端连上即掐，稳定期防抖让窗口照常走满并收束进离线态
    for (let i = 0; i < 40 && !statuses.includes('disconnected'); i++) {
      const socket = MockWebSocket.instances.at(-1)!;
      socket.open();
      socket.close();
      await vi.advanceTimersByTimeAsync(10_000);
    }

    expect(statuses).toContain('disconnected');
  });
});
