/**
 * @fileoverview 商城商品本地图标的解析、产址与回图。
 *
 * 已安装 skill 与 MCP 的图标文件随商品文件夹整体落盘，安装 meta 记录
 * 文件名与远程网址。这里按两级顺序解析本地路径，命中即产出挂内容哈希
 * 的相对地址，未命中由调用方回退远程网址。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Response } from 'express';
import { getFileHash } from './asset-hash.js';
import { Logger } from './logger.js';

/** 安装 meta 里与图标定位相关的字段 */
export interface LocalLogoMeta {
  logoFile?: string;
  logoUrl?: string;
}

/** logo 的扩展名与 mime 对照，商城仓实际存在 png 与 svg 两种 */
const LOGO_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * 判断候选名是否为可直接拼进目录的纯文件名。
 * 含路径分隔符或上跳片段的名字一律拒绝，坏数据不进文件系统。
 */
function isPlainFileName(name: string): boolean {
  return (
    name.length > 0 &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..')
  );
}

/**
 * 从网址尾段提取文件名，问号后的查询串一并截掉。
 */
function fileNameFromUrl(url: string): string {
  const tail = url.split('/').pop() || '';
  return tail.split('?')[0] || '';
}

/**
 * 解析商品目录里的本地图标文件。
 * 解析顺序：
 * - meta 的 logoFile 指向的文件存在即返回
 * - 否则取 logoUrl 尾段当文件名，文件存在即返回，旧安装靠这步免重装迁移
 * - 否则返回 undefined
 */
export function resolveLocalLogoFile(
  dir: string,
  meta: LocalLogoMeta
): string | undefined {
  if (meta.logoFile && isPlainFileName(meta.logoFile)) {
    const byFile = path.join(dir, meta.logoFile);
    if (fs.existsSync(byFile)) return byFile;
  }
  const fromUrl = meta.logoUrl ? fileNameFromUrl(meta.logoUrl) : '';
  if (fromUrl && isPlainFileName(fromUrl)) {
    const byUrl = path.join(dir, fromUrl);
    if (fs.existsSync(byUrl)) return byUrl;
  }
  return undefined;
}

/**
 * 产出已安装商品的图标地址。
 * 本地命中拼挂内容哈希的相对地址，文件不变哈希不变，客户端可长期缓存。
 * 未命中回退 meta 的远程网址并记一条日志，无任何图标记录时静默返回原值。
 * @param dir - 商品落盘目录
 * @param meta - 安装 meta 的图标字段
 * @param routePath - 形如 /api/skills/name/logo 的本地图标路由路径
 * @param logTag - 日志通道名
 * @param label - 日志里定位商品的名字
 */
export function produceLocalLogoUrl(
  dir: string,
  meta: LocalLogoMeta,
  routePath: string,
  logTag: string,
  label: string
): string | undefined {
  const logoPath = resolveLocalLogoFile(dir, meta);
  if (logoPath) {
    return `${routePath}?h=${getFileHash(logoPath)}`;
  }
  if (meta.logoFile || meta.logoUrl) {
    Logger.log(
      logTag,
      `Local logo missing for '${label}', falling back to remote url`
    );
  }
  return meta.logoUrl;
}

/**
 * 把本地图标文件流式回给客户端。
 * mime 按扩展名查表，未知扩展名不设 Content-Type 交给客户端处理。
 * 带 h 参数的地址内容不变，回一年期 immutable，不带则不设长缓存。
 * @param res - Express 响应对象
 * @param logoPath - 本地图标文件的绝对路径
 * @param hashed - 请求地址是否携带内容哈希参数
 */
export function sendLocalLogo(
  res: Response,
  logoPath: string,
  hashed: boolean
): void {
  const contentType = LOGO_MIME_MAP[path.extname(logoPath).toLowerCase()];
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (hashed) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  fs.createReadStream(logoPath).pipe(res);
}
