/**
 * @fileoverview 素材文件的内容哈希计算与缓存。
 *
 * 头像、立绘、背景的缓存身份依赖内容哈希，这里按文件路径做内存缓存，
 * mtime 加 size 变化即失效重算，文件缺失返回空串。
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

interface HashCacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
}

const hashCache = new Map<string, HashCacheEntry>();

/**
 * 取文件内容的 sha256 十六进制哈希，结果按路径缓存。
 * mtime 或 size 变化时重算，文件缺失时清掉缓存项并返回空串。
 * @param filePath - 文件的绝对路径
 * @returns 哈希十六进制串，文件不存在返回空串
 */
export function getFileHash(filePath: string): string {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    hashCache.delete(filePath);
    return '';
  }

  const cached = hashCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.hash;
  }

  const hash = createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
  hashCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, hash });
  return hash;
}
