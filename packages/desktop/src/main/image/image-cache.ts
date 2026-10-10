/**
 * @fileoverview 客户端图片缓存核心，内容哈希承担缓存身份。
 *
 * 已看过的图片以 sha256 十六进制串为文件名落在缓存目录，命中路径
 * 零网络回流。未命中路径经 src 地址下载并校验哈希，通过后以临时
 * 文件加 rename 落盘。模块不依赖 electron，日志与 fetch 经构造注入，
 * vitest 可直测。
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** 缓存命中结果，字节与按字节头嗅探出的 Content-Type */
export interface CachedImage {
  data: Uint8Array;
  contentType: string;
}

/** fetch 实现形态，主进程注入全局 fetch，测试注入替身 */
export type FetchLike = (url: string) => Promise<Response>;

/** 内容哈希的严格格式，64 位小写十六进制 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * 按字节头嗅探图片的 Content-Type。
 * 二进制格式看魔数，svg 看文本开头加 svg 标记，
 * 其余返回 application/octet-stream 交给调用方兜底。
 */
export function sniffContentType(data: Uint8Array): string {
  if (data.length >= 4) {
    if (
      data[0] === 0x89 &&
      data[1] === 0x50 &&
      data[2] === 0x4e &&
      data[3] === 0x47
    ) {
      return 'image/png';
    }
    if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
      return 'image/jpeg';
    }
    if (data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) {
      return 'image/gif';
    }
    if (
      data[0] === 0x52 &&
      data[1] === 0x49 &&
      data[2] === 0x46 &&
      data[3] === 0x46 &&
      data[8] === 0x57 &&
      data[9] === 0x45 &&
      data[10] === 0x42 &&
      data[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  const head = new TextDecoder().decode(data.slice(0, 512)).trimStart();
  if (head.startsWith('<') && head.includes('<svg')) {
    return 'image/svg+xml';
  }
  return 'application/octet-stream';
}

/**
 * 图片缓存实例。
 * 缓存目录按需创建，文件名即内容哈希，同哈希并发请求共享一次下载。
 */
export class ImageCache {
  /** 进行中的下载表，键为内容哈希，落定后移除 */
  private readonly inflight = new Map<string, Promise<CachedImage | null>>();

  constructor(
    private readonly cacheDir: string,
    private readonly log: (message: string) => void = () => {},
    private readonly fetchImpl: FetchLike = (url) => fetch(url)
  ) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  /**
   * 取一张图，命中路径读本地文件，未命中路径下载校验后落盘。
   * @param hash - 内容哈希，承担缓存键与文件名
   * @param src - 未命中时下载用的完整地址
   * @returns 字节与 Content-Type，哈希格式非法或下载校验失败返回 null
   */
  async resolve(hash: string, src: string): Promise<CachedImage | null> {
    if (!HASH_PATTERN.test(hash)) {
      this.log(`image cache rejected invalid hash: ${hash}`);
      return null;
    }
    const local = this.readLocal(hash);
    if (local) return local;

    let pending = this.inflight.get(hash);
    if (!pending) {
      pending = this.download(hash, src).finally(() => {
        this.inflight.delete(hash);
      });
      this.inflight.set(hash, pending);
    }
    return pending;
  }

  /** 读本地缓存文件，不存在返回 null */
  private readLocal(hash: string): CachedImage | null {
    const filePath = path.join(this.cacheDir, hash);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath);
    return { data, contentType: sniffContentType(data) };
  }

  /** 下载并校验落盘，任何一步失败返回 null 且不落盘 */
  private async download(
    hash: string,
    src: string
  ): Promise<CachedImage | null> {
    try {
      const response = await this.fetchImpl(src);
      if (!response.ok) {
        this.log(
          `image cache download failed for ${hash}, status ${response.status}`
        );
        return null;
      }
      const data = new Uint8Array(await response.arrayBuffer());
      const actual = createHash('sha256').update(data).digest('hex');
      if (actual !== hash) {
        this.log(`image cache hash mismatch for ${hash}, got ${actual}`);
        return null;
      }
      const finalPath = path.join(this.cacheDir, hash);
      const tmpPath = `${finalPath}.tmp`;
      fs.writeFileSync(tmpPath, data);
      fs.renameSync(tmpPath, finalPath);
      this.log(`image cache stored ${hash}, ${data.length} bytes`);
      return { data, contentType: sniffContentType(data) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`image cache download error for ${hash}: ${message}`);
      return null;
    }
  }
}
