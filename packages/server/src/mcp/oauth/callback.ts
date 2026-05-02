/**
 * @fileoverview Temporary local HTTP server for receiving OAuth callbacks.
 *
 * Listens on a random port, waits for the browser to redirect back with
 * an authorization code, then shuts down.
 */

import * as http from 'node:http';
import { Logger } from '../../util/logger.js';

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;text-align:center;padding-top:80px">
<h2>Authorization successful</h2><p>You can close this tab and return to the app.</p>
</body></html>`;

export interface CallbackResult {
  port: number;
  waitForCode: () => Promise<string>;
  close: () => void;
}

/**
 * Start a temporary HTTP server on a random port to receive the OAuth callback.
 *
 * The caller should:
 * 1. Read `result.port` to get the actual port number
 * 2. Configure the provider's redirect URL as `http://localhost:{port}/callback`
 * 3. Call `result.waitForCode()` to block until the code arrives (or timeout)
 * 4. Call `result.close()` when done
 */
export function startCallbackServer(): Promise<CallbackResult> {
  let resolveCode: ((code: string) => void) | undefined;
  const codePromise = new Promise<string>((resolve) => {
    resolveCode = resolve;
  });

  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith('/callback')) {
      res.writeHead(404).end();
      return;
    }

    const url = new URL(req.url, `http://localhost`);
    const code = url.searchParams.get('code');

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SUCCESS_HTML);

    if (code && resolveCode) {
      Logger.log('MCP-OAuth', 'OAuth callback received authorization code');
      resolveCode(code);
      resolveCode = undefined;
    }
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;

      Logger.log('MCP-OAuth', `OAuth callback server started on port ${port}`);

      const timeoutId = setTimeout(() => {
        server.close();
      }, CALLBACK_TIMEOUT_MS);

      resolve({
        port,
        waitForCode: () => codePromise,
        close: () => {
          clearTimeout(timeoutId);
          server.close();
        },
      });
    });
  });
}
