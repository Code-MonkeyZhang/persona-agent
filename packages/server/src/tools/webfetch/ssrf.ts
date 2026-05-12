/**
 * @fileoverview SSRF（服务端请求伪造）防护模块。
 *
 * 通过 URL 协议白名单、主机名黑名单、DNS 解析后私有 IP 检查来防止 SSRF 攻击。
 * 不依赖外部 IP 解析库（如 ipaddr.js），使用手写 CIDR 范围检查。
 */

import { lookup as dnsLookup } from 'node:dns/promises';

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

/**
 * 检查主机名是否在黑名单中（localhost、.local、.internal 等）。
 */
export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  if (!normalized) return false;
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * 检查 IP 地址是否为私有/保留地址。
 *
 * 使用手写 CIDR 范围检查，不依赖 ipaddr.js。
 * 支持 IPv4 和 IPv6 地址，包括 IPv4-mapped IPv6 地址。
 */
export function isPrivateIpAddress(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed) return false;

  // IPv4-mapped IPv6: ::ffff:x.x.x.x
  const ipv4MappedMatch = trimmed.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4MappedMatch) {
    return isPrivateIpv4(ipv4MappedMatch[1]);
  }

  // IPv6 loopback
  if (trimmed === '::1' || trimmed === '0:0:0:0:0:0:0:1') return true;

  // IPv6 unique local: fc00::/7 — first byte >= 0xfc and <= 0xfd
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length > 0 && parts[0].length >= 2) {
      const firstByte = parseInt(parts[0].slice(0, 2), 16);
      if (firstByte >= 0xfc && firstByte <= 0xfd) return true;
    }
    // IPv6 link-local: fe80::/10
    if (
      parts[0].startsWith('fe8') ||
      parts[0].startsWith('fe9') ||
      parts[0].startsWith('fea') ||
      parts[0].startsWith('feb')
    ) {
      return true;
    }
  }

  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
    return isPrivateIpv4(trimmed);
  }

  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => isNaN(o))) return false;

  const [a, b] = [octets[0], octets[1]];

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (IANA benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;

  return false;
}

/**
 * 综合检查 URL 是否指向公网地址。
 *
 * 执行三步检查：协议 → 主机名黑名单 → DNS 解析后 IP 私有地址检查。
 * 任一检查失败都会抛出 SsrfBlockedError。
 *
 * @returns 通过检查后的 URL 字符串
 * @throws {SsrfBlockedError} 当 URL 指向私有地址或被阻止的主机名时
 */
export async function assertPublicUrl(url: string): Promise<string> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SsrfBlockedError(
      `Blocked: unsupported protocol ${parsed.protocol}`
    );
  }

  const hostname = parsed.hostname.toLowerCase().trim();
  if (!hostname) {
    throw new SsrfBlockedError('Blocked: empty hostname');
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(
      `Blocked: hostname "${hostname}" is not allowed`
    );
  }

  try {
    const result = await dnsLookup(hostname);
    if (isPrivateIpAddress(result.address)) {
      throw new SsrfBlockedError(
        `Blocked: ${hostname} resolves to private IP ${result.address}`
      );
    }
  } catch (error) {
    if (error instanceof SsrfBlockedError) throw error;
    throw new SsrfBlockedError(
      `Blocked: unable to resolve hostname "${hostname}"`
    );
  }

  return parsed.toString();
}
