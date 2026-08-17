/**
 * @fileoverview Reverse proxy for Agent App HTTP and WebSocket traffic.
 *
 * Forwards /apps/:name/* to the App's local HTTP server (127.0.0.1:{port}).
 * Strips X-Frame-Options and CSP so content loads inside <webview>.
 */

import type { Request, Response, NextFunction } from 'express';
import type { Duplex } from 'node:stream';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { getAppPort } from './pool.js';
import { Logger } from '../util/logger.js';

/**
 * Parse /apps/:name/* URL into app name and target path.
 * Preserves query strings; defaults to '/' when no sub-path given.
 */
function parseAppPath(
  url: string
): { name: string; targetPath: string } | null {
  const match = url.match(/^\/apps\/([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) return null;
  return {
    name: match[1],
    targetPath: (match[2] || '/') + (match[3] || ''),
  };
}

/** Response headers removed so proxied content embeds inside <webview> */
const STRIPPED_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
]);

/**
 * Express middleware: proxies /apps/:name/* HTTP requests to the App's server.
 * Must be mounted before express.json() to preserve raw request bodies.
 */
export function appProxyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.url.startsWith('/apps/')) return next();

  const parsed = parseAppPath(req.url);
  if (!parsed) return next();

  const port = getAppPort(parsed.name);
  if (!port) {
    Logger.log(
      'APP-PROXY',
      `${req.method} ${req.url} -> app "${parsed.name}" not running`
    );
    res.status(502).json({ error: `App "${parsed.name}" is not running` });
    return;
  }

  Logger.log(
    'APP-PROXY',
    `${req.method} ${req.url} -> 127.0.0.1:${port}${parsed.targetPath}`
  );

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path: parsed.targetPath,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (proxyRes) => {
      const headers: http.OutgoingHttpHeaders = {};
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!STRIPPED_HEADERS.has(key.toLowerCase())) {
          headers[key] = value;
        }
      }
      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    Logger.log(
      'APP-PROXY',
      `${req.method} ${req.url} -> proxy error: ${err.message}`
    );
    if (!res.headersSent) {
      res.status(502).json({ error: `Failed to reach app "${parsed.name}"` });
    }
  });

  req.pipe(proxyReq);
}

/**
 * WebSocket-to-WebSocket proxy for /apps/:name/* paths.
 *
 * Accepts the webview's WS connection with a local WebSocketServer, then
 * opens a second WS connection to the App's uvicorn server. Messages are
 * forwarded both ways. The ws library handles framing, ping/pong, and
 * compression transparently — we never touch raw bytes.
 */
const appWss = new WebSocketServer({ noServer: true });

export function handleAppWsUpgrade(
  req: http.IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  const parsed = parseAppPath(req.url || '');
  if (!parsed) {
    socket.destroy();
    return;
  }

  const port = getAppPort(parsed.name);
  if (!port) {
    Logger.log(
      'APP-PROXY',
      `WS ${req.url} -> app "${parsed.name}" not running`
    );
    socket.destroy();
    return;
  }

  Logger.log(
    'APP-PROXY',
    `WS ${req.url} -> 127.0.0.1:${port}${parsed.targetPath}`
  );

  const logUrl = req.url || '';

  // Accept the webview's WebSocket connection (completes the handshake)
  appWss.handleUpgrade(req, socket, head, (clientWs) => {
    // Connect to the App's uvicorn WS endpoint
    const targetUrl = `ws://127.0.0.1:${port}${parsed.targetPath}`;
    const targetWs = new WebSocket(targetUrl);

    targetWs.on('open', () => {
      Logger.log('APP-PROXY', `WS ${logUrl} -> uvicorn connected`);
    });

    // uvicorn -> webview
    targetWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    // webview -> uvicorn
    clientWs.on('message', (data, isBinary) => {
      if (targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(data, { binary: isBinary });
      }
    });

    // Either side closing tears down both
    targetWs.on('close', () => clientWs.close());
    clientWs.on('close', () => {
      if (targetWs.readyState === WebSocket.OPEN) targetWs.close();
    });

    targetWs.on('error', (err) => {
      Logger.log('APP-PROXY', `WS ${logUrl} -> target error: ${err.message}`);
      clientWs.close();
    });

    clientWs.on('error', () => {
      if (targetWs.readyState === WebSocket.OPEN) targetWs.close();
    });

    targetWs.on('unexpected-response', (_req, res) => {
      Logger.log(
        'APP-PROXY',
        `WS ${logUrl} -> uvicorn returned HTTP ${res.statusCode}`
      );
      clientWs.close();
    });
  });
}
