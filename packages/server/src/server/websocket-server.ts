/**
 * @fileoverview WebSocket server for real-time event broadcasting.
 *
 * Clients connect, subscribe to sessionIds, and receive events.
 * This module only handles broadcasting - no chat triggering.
 */

import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import { randomUUID } from 'node:crypto';
import type { ServerMessage, ClientMessage } from '@persona/shared';
import { Logger } from '../util/logger.js';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, WebSocketClient>();
let wss: WebSocketServer | null = null;

export function initWebSocket(server: import('http').Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const clientId = randomUUID();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      subscriptions: new Set(),
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

    ws.on('close', () => {
      clients.delete(clientId);
      Logger.log('WS', `Client disconnected: ${clientId}`);
    });

    ws.on('error', (error) => {
      Logger.log('WS', `Client error ${clientId}:`, error);
      clients.delete(clientId);
    });
  });

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
      sendToClient(client, { type: 'pong' });
      break;
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

export function shutdownWebSocket(): void {
  if (wss) {
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
