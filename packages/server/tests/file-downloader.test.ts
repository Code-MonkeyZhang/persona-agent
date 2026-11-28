/**
 * @fileoverview FileDownloader 单元测试。
 * 起一个本机的测试 HTTP 服务，把每条下载规则逐个走一遍，不访问外网。
 * 规则里的时间都缩到一百多毫秒，重试的等待缩到二十毫秒。
 */

import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rmTempDir } from './temp-cleanup.js';

const logSpy = mock(
  (_category: string, _message: string, _data?: unknown) => {}
);
const criticalSpy = mock(
  (_category: string, _message: string, _data?: unknown) => {}
);

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: logSpy,
    critical: criticalSpy,
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

import {
  FileDownloader,
  DownloadError,
  type DownloadProgress,
} from '../src/util/file-downloader.js';

/** 测试用的短规则，连接和卡死都只等一小会儿 */
const FAST_RULES = {
  connectTimeoutMs: 150,
  stallTimeoutMs: 150,
  maxAttempts: 2,
  retryDelayMs: 20,
};
/** 一个足够宽松的截止时刻，不测预算的用例都用它 */
const FAR_DEADLINE = () => Date.now() + 10_000;

const BODY = Buffer.alloc(3000, 7);
/** 把正文分成三块发，块与块之间隔一会儿，进度才有好几帧 */
const sendInChunks: http.RequestListener = (_req, res) => {
  const third = BODY.length / 3;
  res.writeHead(200, { 'content-length': String(BODY.length) });
  res.write(BODY.subarray(0, third));
  setTimeout(() => {
    res.write(BODY.subarray(third, third * 2));
    setTimeout(() => res.end(BODY.subarray(third * 2)), 10);
  }, 10);
};

let server: http.Server;
let baseUrl: string;
let tempDir: string;
let dest: string;
/** 每个路径被请求的次数 */
let hits: Record<string, number>;
/** 按路径分流的处理函数，没登记的路径一律 404 */
let handlers: Record<string, http.RequestListener>;

const hitsOf = (route: string): number => hits[route] ?? 0;

/** 登记一个路径，返回它的完整地址 */
const route = (name: string, handler: http.RequestListener): string => {
  handlers[name] = handler;
  return `${baseUrl}${name}`;
};

/** 收集进度帧的回调，返回装进度的数组 */
function collect(): {
  progress: DownloadProgress[];
  onProgress: (progress: DownloadProgress) => void;
} {
  const progress: DownloadProgress[] = [];
  return { progress, onProgress: (p) => progress.push(p) };
}

/** 跑一次下载，返回它抛出的错误，没抛出时返回 null */
async function failureOf(
  url: string,
  target: string = dest,
  deadline: number = FAR_DEADLINE()
): Promise<DownloadError | null> {
  try {
    await new FileDownloader(FAST_RULES).download(
      url,
      target,
      () => {},
      deadline
    );
    return null;
  } catch (err) {
    return err as DownloadError;
  }
}

beforeEach(async () => {
  logSpy.mockClear();
  criticalSpy.mockClear();
  hits = {};
  handlers = {};
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    hits[url] = (hits[url] ?? 0) + 1;
    (handlers[url] ?? ((_r, response) => response.writeHead(404).end()))(
      req,
      res
    );
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    });
  });
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-downloader-'));
  dest = path.join(tempDir, 'out.bin');
});

afterEach(() => {
  server.closeAllConnections();
  server.close();
  rmTempDir(tempDir);
});

describe('FileDownloader', () => {
  it('writes the full file and reports increasing progress', async () => {
    const { progress, onProgress } = collect();

    await new FileDownloader(FAST_RULES).download(
      route('/ok', sendInChunks),
      dest,
      onProgress,
      FAR_DEADLINE()
    );

    expect(fs.readFileSync(dest).equals(BODY)).toBe(true);
    expect(progress[0]).toEqual({ received: 0, total: BODY.length });
    expect(progress.at(-1)).toEqual({
      received: BODY.length,
      total: BODY.length,
    });
    expect(progress.length).toBeGreaterThan(3);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].received).toBeGreaterThan(progress[i - 1].received);
    }
  });

  it('reports a null total when the server declares no length', async () => {
    const { progress, onProgress } = collect();
    const url = route('/chunked', (_req, res) => {
      // 分两次写又不设长度头，Node 才会走分块传输，响应里没有长度
      res.write(BODY.subarray(0, 100));
      setTimeout(() => res.end(BODY.subarray(100)), 10);
    });

    await new FileDownloader(FAST_RULES).download(
      url,
      dest,
      onProgress,
      FAR_DEADLINE()
    );

    expect(fs.readFileSync(dest).equals(BODY)).toBe(true);
    expect(progress.every((frame) => frame.total === null)).toBe(true);
  });

  it('fails without retrying when the address returns 404', async () => {
    const url = route('/missing', (_req, res) => {
      res.writeHead(404).end('gone');
    });

    const error = await failureOf(url);

    expect(error?.kind).toBe('server');
    expect(error?.retryable).toBe(false);
    expect(hitsOf('/missing')).toBe(1);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('fails without retrying on a non-transient 4xx', async () => {
    const url = route('/forbidden', (_req, res) => {
      res.writeHead(403).end();
    });

    const error = await failureOf(url);

    expect(error?.kind).toBe('server');
    expect(hitsOf('/forbidden')).toBe(1);
  });

  it('retries a 500 once and succeeds on the second request', async () => {
    const url = route('/flaky', (req, res) => {
      if (hitsOf('/flaky') === 1) {
        res.writeHead(500).end('boom');
      } else {
        sendInChunks(req, res);
      }
    });

    await new FileDownloader(FAST_RULES).download(
      url,
      dest,
      () => {},
      FAR_DEADLINE()
    );

    expect(hitsOf('/flaky')).toBe(2);
    expect(fs.readFileSync(dest).equals(BODY)).toBe(true);
  });

  it('treats 429 as transient and retries', async () => {
    const url = route('/limited', (_req, res) => {
      if (hitsOf('/limited') === 1) {
        res.writeHead(429).end();
      } else {
        res.writeHead(200, { 'content-length': String(BODY.length) });
        res.end(BODY);
      }
    });

    await new FileDownloader(FAST_RULES).download(
      url,
      dest,
      () => {},
      FAR_DEADLINE()
    );

    expect(hitsOf('/limited')).toBe(2);
  });

  it('fails as slow when the server stalls after the first bytes', async () => {
    const url = route('/stall', (_req, res) => {
      res.writeHead(200, { 'content-length': String(BODY.length) });
      res.write(BODY.subarray(0, 100));
    });

    const startedAt = Date.now();
    const error = await failureOf(url);
    // 两次卡死加一次重试等待，远小于截止时刻，证明计时取的是较短的那个
    expect(Date.now() - startedAt).toBeLessThan(1_000);

    expect(error?.kind).toBe('slow');
    expect(hitsOf('/stall')).toBe(2);
    expect(fs.existsSync(dest)).toBe(false);
    expect(criticalSpy).toHaveBeenCalled();
  });

  it('fails as network when the server never responds', async () => {
    const url = route('/silent', () => {});

    const startedAt = Date.now();
    const error = await failureOf(url);
    expect(Date.now() - startedAt).toBeLessThan(1_000);

    expect(error?.kind).toBe('network');
    expect(error?.retryable).toBe(true);
    expect(hitsOf('/silent')).toBe(2);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('retries when the connection drops mid-body', async () => {
    const url = route('/drop', (_req, res) => {
      if (hitsOf('/drop') === 1) {
        res.writeHead(200, { 'content-length': String(BODY.length) });
        res.write(BODY.subarray(0, 500));
        setTimeout(() => res.destroy(), 10);
      } else {
        sendInChunks(_req, res);
      }
    });

    await new FileDownloader(FAST_RULES).download(
      url,
      dest,
      () => {},
      FAR_DEADLINE()
    );

    expect(hitsOf('/drop')).toBe(2);
    expect(fs.readFileSync(dest).equals(BODY)).toBe(true);
  });

  it('retries when the body ends short of the declared length', async () => {
    const url = route('/short', (_req, res) => {
      if (hitsOf('/short') === 1) {
        res.writeHead(200, { 'content-length': String(BODY.length) });
        res.end(BODY.subarray(0, 400));
      } else {
        sendInChunks(_req, res);
      }
    });

    await new FileDownloader(FAST_RULES).download(
      url,
      dest,
      () => {},
      FAR_DEADLINE()
    );

    expect(hitsOf('/short')).toBe(2);
    expect(fs.readFileSync(dest).equals(BODY)).toBe(true);
  });

  it('fails as slow without retrying once the deadline has passed', async () => {
    const url = route('/late', sendInChunks);

    const error = await failureOf(url, dest, Date.now() - 1);

    expect(error?.kind).toBe('slow');
    expect(error?.retryable).toBe(false);
    // 请求可能在发出去之前就被中止，服务端计到零次或一次都对
    expect(hitsOf('/late')).toBeLessThanOrEqual(1);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it('fails as local without retrying when the file cannot be written', async () => {
    const url = route('/unwritable', sendInChunks);

    const error = await failureOf(url, path.join(tempDir, 'no-such-dir', 'x'));

    expect(error?.kind).toBe('local');
    expect(error?.retryable).toBe(false);
    expect(hitsOf('/unwritable')).toBe(1);
  });

  it('passes the failing error to the critical log with its cause', async () => {
    const url = route('/gone', (_req, res) => res.writeHead(410).end());

    await failureOf(url);

    const [category, message, data] = criticalSpy.mock.calls[0];
    expect(category).toBe('DOWNLOAD');
    expect(message).toContain('url=' + url);
    expect(data).toBeInstanceOf(DownloadError);
    expect((data as DownloadError).kind).toBe('server');
  });
});
