/**
 * @fileoverview File system read helpers.
 */

import * as fs from 'node:fs';

/**
 * 安全读取并解析 JSON 文件。
 *
 * 文件不存在、内容为空或 JSON 解析失败时返回 fallback，不抛出异常。
 *
 * @param filePath - JSON 文件路径
 * @param fallback - 读取失败时的默认返回值
 * @returns 解析后的对象，类型与 fallback 一致
 */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return fallback;
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}
