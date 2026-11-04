/**
 * @fileoverview 图片缓存核心测试：命中、下载落盘、校验失败、并发合并、种入、废弃清理与嗅探。
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import {
  ImageCache,
  sniffContentType,
  pruneLegacyFlatFiles,
} from '../src/main/image/image-cache';

/** 临时根目录，每个用例在下面建独立缓存目录 */
let tempDir: string;

/** 当前用例的缓存目录 */
let cacheDir: string;

/** png 魔数开头的最小字节串 */
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
]);

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** 造带下载记录的 fetch 替身，delay 控制是否让下载在时间上交错 */
function fakeFetch(
  data: Uint8Array<ArrayBuffer>,
  options?: { status?: number; delay?: number }
) {
  const calls: string[] = [];
  const impl = async (url: string): Promise<Response> => {
    calls.push(url);
    if (options?.delay) {
      await new Promise((resolve) => setTimeout(resolve, options.delay));
    }
    if (options?.status && options.status !== 200) {
      return new Response('error', { status: options.status });
    }
    return new Response(data);
  };
  return { impl, calls };
}

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'image-cache-test-'));
});

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(tempDir, 'case-'));
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('ImageCache', () => {
  it('should download, verify and persist on miss', async () => {
    const hash = sha256(PNG_BYTES);
    const fetcher = fakeFetch(PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    const image = await cache.resolve(hash, 'http://server/avatar');

    expect(image?.contentType).toBe('image/png');
    expect(Array.from(image?.data ?? [])).toEqual(Array.from(PNG_BYTES));
    expect(fs.existsSync(path.join(cacheDir, hash))).toBe(true);
    expect(fetcher.calls).toEqual(['http://server/avatar']);
  });

  it('should serve from local file without fetching on hit', async () => {
    const hash = sha256(PNG_BYTES);
    fs.writeFileSync(path.join(cacheDir, hash), PNG_BYTES);
    const fetcher = fakeFetch(PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    const image = await cache.resolve(hash, 'http://server/avatar');

    expect(image?.contentType).toBe('image/png');
    expect(fetcher.calls).toEqual([]);
  });

  it('should hit locally when the same hash arrives with a different src', async () => {
    const hash = sha256(PNG_BYTES);
    const fetcher = fakeFetch(PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    await cache.resolve(hash, 'http://server:3847/avatar');
    const image = await cache.resolve(hash, 'http://tunnel.example/avatar');

    expect(image).not.toBeNull();
    expect(fetcher.calls).toEqual(['http://server:3847/avatar']);
  });

  it('should not persist when downloaded bytes fail hash check', async () => {
    const wrongBytes = new Uint8Array([1, 2, 3]);
    const hash = sha256(PNG_BYTES);
    const logs: string[] = [];
    const fetcher = fakeFetch(wrongBytes);
    const cache = new ImageCache(cacheDir, (m) => logs.push(m), fetcher.impl);

    const image = await cache.resolve(hash, 'http://server/avatar');

    expect(image).toBeNull();
    expect(fs.existsSync(path.join(cacheDir, hash))).toBe(false);
    expect(logs.some((m) => m.includes('hash mismatch'))).toBe(true);
  });

  it('should merge concurrent requests for the same hash into one download', async () => {
    const hash = sha256(PNG_BYTES);
    const fetcher = fakeFetch(PNG_BYTES, { delay: 30 });
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    const [first, second] = await Promise.all([
      cache.resolve(hash, 'http://server/avatar'),
      cache.resolve(hash, 'http://server/avatar'),
    ]);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(fetcher.calls.length).toBe(1);
  });

  it('should reject invalid hash without touching the network', async () => {
    const fetcher = fakeFetch(PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    const image = await cache.resolve('not-a-hash', 'http://server/avatar');

    expect(image).toBeNull();
    expect(fetcher.calls).toEqual([]);
  });

  it('should persist verified seed bytes and serve later resolve without fetching', () => {
    const hash = sha256(PNG_BYTES);
    const fetcher = fakeFetch(PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {}, fetcher.impl);

    expect(cache.seed(hash, PNG_BYTES)).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, hash))).toBe(true);

    return cache.resolve(hash, 'http://server/avatar').then((image) => {
      expect(image).not.toBeNull();
      expect(fetcher.calls).toEqual([]);
    });
  });

  it('should reject seed bytes failing hash check without writing', () => {
    const hash = sha256(PNG_BYTES);
    const logs: string[] = [];
    const cache = new ImageCache(cacheDir, (m) => logs.push(m));

    expect(cache.seed(hash, new Uint8Array([1, 2, 3]))).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, hash))).toBe(false);
    expect(logs.some((m) => m.includes('seed mismatch'))).toBe(true);
  });

  it('should treat seed as idempotent when the hash already exists locally', () => {
    const hash = sha256(PNG_BYTES);
    fs.writeFileSync(path.join(cacheDir, hash), PNG_BYTES);
    const cache = new ImageCache(cacheDir, () => {});

    expect(cache.seed(hash, new Uint8Array([9, 9, 9]))).toBe(true);
    const stored = fs.readFileSync(path.join(cacheDir, hash));
    expect(Array.from(stored)).toEqual(Array.from(PNG_BYTES));
  });
});

describe('pruneLegacyFlatFiles', () => {
  it('should remove only flat hash-named files and keep device directories', () => {
    const hash = sha256(PNG_BYTES);
    fs.writeFileSync(path.join(cacheDir, hash), PNG_BYTES);
    fs.writeFileSync(path.join(cacheDir, 'junk.txt'), PNG_BYTES);
    fs.mkdirSync(path.join(cacheDir, 'local'));
    fs.writeFileSync(path.join(cacheDir, 'local', hash), PNG_BYTES);

    const removed = pruneLegacyFlatFiles(cacheDir);

    expect(removed).toBe(1);
    expect(fs.existsSync(path.join(cacheDir, hash))).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, 'junk.txt'))).toBe(true);
    expect(fs.existsSync(path.join(cacheDir, 'local', hash))).toBe(true);
  });

  it('should return zero when the root does not exist', () => {
    expect(pruneLegacyFlatFiles(path.join(cacheDir, 'missing'))).toBe(0);
  });
});

describe('sniffContentType', () => {
  it('should sniff binary formats by magic bytes', () => {
    expect(sniffContentType(PNG_BYTES)).toBe('image/png');
    expect(
      sniffContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]))
    ).toBe('image/jpeg');
    expect(
      sniffContentType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1]))
    ).toBe('image/gif');
    expect(
      sniffContentType(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ])
      )
    ).toBe('image/webp');
  });

  it('should sniff svg by leading text marker', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    );
    expect(sniffContentType(svg)).toBe('image/svg+xml');
  });

  it('should fall back to octet-stream for unknown bytes', () => {
    expect(sniffContentType(new Uint8Array([1, 2, 3, 4]))).toBe(
      'application/octet-stream'
    );
  });
});
