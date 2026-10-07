/**
 * @fileoverview persona-image 自定义协议的特权声明与请求处理。
 *
 * 协议地址形如 persona-image://{64位哈希}?src={编码后的完整地址}，
 * 主机名承担缓存键，src 只是未命中路径的一次性传输工具。
 * 这里只做格式与来源校验加响应包装，命中与下载由 ImageCache 承担。
 */

import { protocol } from 'electron';
import log from 'electron-log';
import type { ImageCache } from './image-cache';

/** 协议名 */
const SCHEME = 'persona-image';

/** 内容哈希的严格格式，64 位小写十六进制 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * 声明协议特权。
 * standard 让协议地址按标准 URL 规则解析出主机名，stream 支持流式回图。
 * 必须在 app ready 前调用，放 whenReady 里会静默失效。
 */
export function registerImageSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, stream: true } },
  ]);
}

/**
 * 挂载协议处理器。
 * 哈希格式与 src 来源不过关直接拒掉，协议不做开放代理，
 * src 只认当前服务端地址，getServerUrl 为空时同样拒绝。
 * @param cache - 图片缓存实例
 * @param getServerUrl - 取当前服务端地址的函数，src 前缀校验依据
 */
export function registerImageProtocol(
  cache: ImageCache,
  getServerUrl: () => string | null
): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    const hash = url.hostname;
    const src = url.searchParams.get('src') ?? '';
    const serverUrl = getServerUrl();

    if (!HASH_PATTERN.test(hash) || !src.startsWith(`${serverUrl}/`)) {
      log.warn(`Rejected persona-image request: ${request.url}`);
      return new Response('Rejected persona-image request', { status: 400 });
    }

    const image = await cache.resolve(hash, src);
    if (!image) {
      return new Response('Image unavailable', { status: 502 });
    }
    return new Response(image.data, {
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  });
}
