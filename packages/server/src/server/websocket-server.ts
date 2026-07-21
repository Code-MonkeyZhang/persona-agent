/**
 * @fileoverview WebSocket server for real-time event broadcasting.
 *
 * Clients connect, subscribe to sessionIds, and receive events.
 * This module only handles broadcasting - no chat triggering.
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { randomUUID } from 'node:crypto';
import type { ServerMessage, ClientMessage, DeviceType } from '@persona/shared';
import { Logger } from '../util/logger.js';
import * as sessionRegistry from './session-registry.js';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  deviceId: string | null;
  deviceType: DeviceType | null;
  deviceName: string | null;
  lastSeen: number;
}

/** 设备离线判定阈值，超过此时间未收到 ping/pong 即判定离线 */
const DEVICE_TIMEOUT_MS = 30_000;

const clients = new Map<string, WebSocketClient>();
let wss: WebSocketServer | null = null;
let deviceCleanupTimer: ReturnType<typeof setInterval> | null = null;

export function initWebSocket(server: import('http').Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = randomUUID();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      deviceId: null,
      deviceType: null,
      deviceName: null,
      lastSeen: Date.now(),
    };

    clients.set(clientId, client);
    Logger.log('WS', `Client connected: ${clientId}`);

    sendToClient(client, { type: 'connected', clientId });

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(client, message);
      } catch (error) {
        Logger.log('WS', 'Invalid message:', error);
      }
    });

    ws.on('close', () => handleClientDisconnect(client));

    ws.on('error', (error) => {
      Logger.log('WS', `Client error ${clientId}:`, error);
      handleClientDisconnect(client);
    });
  });

  startDeviceCleanup();

  Logger.log('WS', 'WebSocket server initialized on /ws');
  return wss;
}

function handleClientMessage(
  client: WebSocketClient,
  message: ClientMessage
): void {
  switch (message.type) {
    case 'subscribe': {
      const { sessionId } = message.payload;
      client.subscriptions.add(sessionId);
      Logger.log('WS', 'Client subscribed', {
        clientId: client.id,
        sessionId,
      });
      sendToClient(client, { type: 'subscribed', sessionId });
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

    case 'ping':
      client.lastSeen = Date.now();
      sendToClient(client, { type: 'pong' });
      break;

    case 'register': {
      client.deviceId = message.deviceId;
      client.deviceType = message.deviceType;
      client.deviceName = message.deviceName;
      client.lastSeen = Date.now();
      Logger.log(
        'WS',
        `Device registered: ${message.deviceName} (${message.deviceType}) deviceId=${message.deviceId}`
      );
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

/**
 * 启动定期清理定时器，关闭 lastSeen 超时的连接。
 * 超时连接的 close 事件会触发 handleClientDisconnect 完成清理和广播。
 */
function startDeviceCleanup(): void {
  if (deviceCleanupTimer) return;
  deviceCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const client of clients.values()) {
      if (client.deviceId && now - client.lastSeen > DEVICE_TIMEOUT_MS) {
        Logger.log(
          'WS',
          `Device timeout, closing: ${client.deviceName} (${client.deviceId})`
        );
        client.ws.close();
      }
    }
  }, DEVICE_TIMEOUT_MS);
}

export function shutdownWebSocket(): void {
  if (wss) {
    if (deviceCleanupTimer) {
      clearInterval(deviceCleanupTimer);
      deviceCleanupTimer = null;
    }
    for (const client of clients.values()) {
      client.ws.close();
    }
    clients.clear();
    wss.close();
    wss = null;
    Logger.log('WS', 'WebSocket server shutdown');
  }
}

export function isWebSocketInitialized(): boolean {
  return wss !== null;
}
