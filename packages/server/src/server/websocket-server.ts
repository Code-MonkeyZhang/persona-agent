/**
 * @fileoverview WebSocket server for real-time event broadcasting.
 *
 * Clients connect, subscribe to sessionIds, and receive events.
 * This module only handles broadcasting - no chat triggering.
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { randomUUID } from 'node:crypto';
import type {
  ServerMessage,
  ClientMessage,
  DeviceType,
  SessionChange,
} from '@persona/shared';
import { Logger } from '../util/logger.js';
import * as sessionRegistry from './services/session-registry.js';
import { getActivity } from './services/activity-registry.js';
import { upsertDevice, touchLastOnline } from './services/device-store.js';
import { sessionChangeEmitter } from '../session/changes.js';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  deviceId: string | null;
  deviceType: DeviceType | null;
  deviceName: string | null;
  lastSeen: number;
  missedPongs: number;
  /** 最近一次下行发送时间，保活循环据此挑选空闲连接 */
  lastSentAt: number;
}

/** 服务端主动探测的间隔，静默连接每轮收到一次协议层 ping */
export const PROBE_INTERVAL_MS = 17_500;
/** 连续漏回容忍上限，两次探测无回应即停滞约 35 秒，此时才断开连接 */
export const MAX_MISSED_PONGS = 2;
/** 应用层保活节拍，与探测节拍解耦，空闲连接每轮收到一条 keepalive 数据帧 */
export const KEEPALIVE_INTERVAL_MS = 5_000;

const clients = new Map<string, WebSocketClient>();
let wss: WebSocketServer | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
/** 变更流订阅是否生效，防止重复初始化造成重复推送 */
let changeSubscribed = false;
/** viewed 消息的处理回调，由 http-server 装配时注入以访问 sessionManagers */
let viewedHandler: ((sessionId: string) => void) | null = null;

/**
 * 注入 viewed 消息的处理回调。
 *
 * 本模块不持有 sessionManagers，未读清除的落库能力经此回调由装配方提供。
 */
export function setViewedHandler(handler: (sessionId: string) => void): void {
  viewedHandler = handler;
}

export function initWebSocket(server: import('http').Server): WebSocketServer {
  const instance = new WebSocketServer({ noServer: true });
  wss = instance;

  // Manually route /ws upgrades so non-/ws paths (e.g. /apps/) are not rejected
  server.on('upgrade', (req, socket, head) => {
    const idx = req.url ? req.url.indexOf('?') : -1;
    const pathname = idx !== -1 ? req.url!.slice(0, idx) : req.url;
    if (pathname !== '/ws') return;
    instance.handleUpgrade(req, socket, head, (ws) => {
      instance.emit('connection', ws, req);
    });
  });

  instance.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = randomUUID();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      deviceId: null,
      deviceType: null,
      deviceName: null,
      lastSeen: Date.now(),
      missedPongs: 0,
      lastSentAt: Date.now(),
    };

    clients.set(clientId, client);
    Logger.log('WS', `Client connected: ${clientId}`);

    sendToClient(client, {
      type: 'connected',
      clientId,
      keepaliveIntervalMs: KEEPALIVE_INTERVAL_MS,
    });
    // 连接建立即推运行快照,晚接入与重连端不缺运行态,广播不重放
    const runningIds = sessionRegistry.list();
    sendToClient(client, {
      type: 'runs_snapshot',
      sessionIds: runningIds,
    });
    Logger.log('WS', 'Runs snapshot sent', {
      clientId,
      count: runningIds.length,
    });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        // 任何消息都是活性信号，正常使用流量本身即保活
        markAlive(client);
        handleClientMessage(client, message);
      } catch (error) {
        Logger.log('WS', 'Invalid message:', error);
      }
    });

    ws.on('pong', () => markAlive(client));

    ws.on('close', () => handleClientDisconnect(client));

    ws.on('error', (error) => {
      Logger.log('WS', `Client error ${clientId}:`, error);
      handleClientDisconnect(client);
    });
  });

  startProbe();
  startKeepalive();
  subscribeToSessionChanges();

  Logger.log('WS', 'WebSocket server initialized (noServer mode, /ws)');
  return instance;
}

/**
 * 订阅变更流并广播给全部在线客户端。
 * 收到即转发的语义要求只挂一个监听器，重复初始化时跳过。
 */
function subscribeToSessionChanges(): void {
  if (changeSubscribed) return;
  changeSubscribed = true;
  sessionChangeEmitter.on('change', (change: SessionChange) => {
    broadcastToAll({ type: 'change', change });
  });
}

function handleClientMessage(
  client: WebSocketClient,
  message: ClientMessage
): void {
  switch (message.type) {
    case 'subscribe': {
      const { sessionId } = message.payload;
      client.subscriptions.add(sessionId);
      const isGenerating = sessionRegistry.has(sessionId);
      Logger.log('WS', 'Client subscribed', {
        clientId: client.id,
        sessionId,
        isGenerating,
      });
      // 生成中的会话附带当前动作，中途接入端立即显示工具执行或思考中
      sendToClient(client, {
        type: 'subscribed',
        sessionId,
        isGenerating,
        currentActivity: isGenerating ? getActivity(sessionId) : undefined,
      });
      break;
    }

    case 'unsubscribe': {
      const { sessionId } = message.payload;
      client.subscriptions.delete(sessionId);
      Logger.log('WS', 'Client unsubscribed', {
        clientId: client.id,
        sessionId,
      });
      break;
    }

    case 'viewed': {
      const { sessionId } = message.payload;
      Logger.log('WS', 'Session viewed', {
        clientId: client.id,
        sessionId,
      });
      viewedHandler?.(sessionId);
      break;
    }

    case 'ping':
      // 旧版客户端的应用层心跳，协议层探测接管后仅为兼容保留
      sendToClient(client, { type: 'pong' });
      break;

    case 'register': {
      client.deviceId = message.deviceId;
      client.deviceType = message.deviceType;
      client.deviceName = message.deviceName;
      Logger.log(
        'WS',
        `Device registered: ${message.deviceName} (${message.deviceType}) deviceId=${message.deviceId}`
      );
      // 设备身份落库，配对记录从此不随重启丢失，失败不阻断注册流程
      try {
        upsertDevice(message.deviceId, message.deviceName, message.deviceType);
      } catch (error) {
        Logger.log('WS', 'Failed to persist device identity', error);
      }
      broadcastToOthers(client, {
        type: 'device_online',
        device: {
          deviceId: message.deviceId,
          deviceType: message.deviceType,
          deviceName: message.deviceName,
        },
      });
      break;
    }

    case 'abort': {
      const { sessionId } = message.payload;
      const triggered = sessionRegistry.abort(sessionId);
      Logger.log('WS', 'Abort requested', { sessionId, triggered });
      break;
    }
  }
}

/**
 * 处理客户端断开连接：从注册表移除，若设备已注册且无其他连接持有相同 deviceId，
 * 则向其他客户端广播 device_offline。
 */
function handleClientDisconnect(client: WebSocketClient): void {
  clients.delete(client.id);
  Logger.log('WS', `Client disconnected: ${client.id}`);

  if (client.deviceId) {
    const stillOnline = [...clients.values()].some(
      (c) => c.deviceId === client.deviceId
    );
    if (!stillOnline) {
      Logger.log(
        'WS',
        `Device offline: ${client.deviceName} (${client.deviceId})`
      );
      try {
        touchLastOnline(client.deviceId);
      } catch (error) {
        Logger.log('WS', 'Failed to update device last_online', error);
      }
      broadcastToOthers(client, {
        type: 'device_offline',
        deviceId: client.deviceId,
      });
    }
  }
}

/**
 * 向除 sender 外的所有已连接客户端广播消息。
 */
function broadcastToOthers(
  sender: WebSocketClient,
  event: ServerMessage
): void {
  for (const client of clients.values()) {
    if (client.id !== sender.id) {
      sendToClient(client, event);
    }
  }
}

function sendToClient(client: WebSocketClient, message: ServerMessage): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
    client.lastSentAt = Date.now();
  }
}

export function broadcastToSession(
  sessionId: string,
  event: ServerMessage
): void {
  for (const client of clients.values()) {
    if (client.subscriptions.has(sessionId)) {
      sendToClient(client, event);
    }
  }
}

/**
 * 向所有已连接的客户端广播消息，不区分 session 订阅。
 *
 * 用于 pair_request 等全局通知场景。
 */
export function broadcastToAll(event: ServerMessage): void {
  for (const client of clients.values()) {
    sendToClient(client, event);
  }
}

/** 返回当前已注册的在线设备列表 */
export function getOnlineDevices(): Array<{
  deviceId: string;
  deviceType: DeviceType;
  deviceName: string;
}> {
  return [...clients.values()]
    .filter((c) => c.deviceId !== null)
    .map((c) => ({
      deviceId: c.deviceId!,
      deviceType: c.deviceType!,
      deviceName: c.deviceName!,
    }));
}

/** 刷新连接活性，任何消息与协议层 pong 都会清零漏回计数 */
function markAlive(client: WebSocketClient): void {
  client.lastSeen = Date.now();
  client.missedPongs = 0;
}

/**
 * 单轮探测对单个连接的处置决定。
 * elapsedMs 为距最近一次活性的毫秒数，missedPongs 为已累计的连续漏回次数。
 * 活跃返回 skip，需要继续探测返回 ping，连续漏回达到上限返回 terminate。
 */
export function decideProbeAction(
  elapsedMs: number,
  missedPongs: number
): 'skip' | 'ping' | 'terminate' {
  if (elapsedMs < PROBE_INTERVAL_MS) return 'skip';
  return missedPongs + 1 >= MAX_MISSED_PONGS ? 'terminate' : 'ping';
}

/**
 * 启动探测定时器，周期性向静默连接发协议层 ping。
 * 连续漏回达到上限才关闭连接，close 事件触发 handleClientDisconnect
 * 完成清理和广播，单次漏回只记录不打断。
 */
function startProbe(): void {
  if (probeTimer) return;
  probeTimer = setInterval(() => {
    const now = Date.now();
    for (const client of clients.values()) {
      const action = decideProbeAction(
        now - client.lastSeen,
        client.missedPongs
      );
      if (action === 'skip') continue;
      if (action === 'terminate') {
        Logger.log(
          'WS',
          `Probe missed ${client.missedPongs + 1} times, closing: ${client.deviceName ?? client.id}`
        );
        client.ws.close();
        continue;
      }
      client.missedPongs += 1;
      client.ws.ping();
    }
  }, PROBE_INTERVAL_MS);
}

/**
 * 启动保活定时器，周期性向下行空闲的连接发应用层 keepalive。
 * 协议层探测回复对客户端脚本不可见，客户端看门狗的新鲜度判定依赖这条数据帧，
 * 忙连接的业务消息本身即保活，不打扰。
 */
function startKeepalive(): void {
  if (keepaliveTimer) return;
  keepaliveTimer = setInterval(() => {
    const now = Date.now();
    for (const client of clients.values()) {
      if (now - client.lastSentAt >= KEEPALIVE_INTERVAL_MS) {
        sendToClient(client, { type: 'keepalive' });
      }
    }
  }, KEEPALIVE_INTERVAL_MS);
}

export function shutdownWebSocket(): void {
  if (wss) {
    if (probeTimer) {
      clearInterval(probeTimer);
      probeTimer = null;
    }
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    for (const client of clients.values()) {
      client.ws.close();
    }
    clients.clear();
    wss.close();
    wss = null;
    // 退订变更流，下次 initWebSocket 重新挂监听
    sessionChangeEmitter.removeAllListeners('change');
    changeSubscribed = false;
    Logger.log('WS', 'WebSocket server shutdown');
  }
}

export function isWebSocketInitialized(): boolean {
  return wss !== null;
}
