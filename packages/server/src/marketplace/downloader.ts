import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSkillsDir, getMcpServersDir } from '../util/paths.js';
import { cdnUrl } from './config.js';
import { listPackageFiles } from './repo-tree.js';
import { folderNameOf } from './util.js';
import type { MarketplaceEntry, McpMarketplaceEntry } from '@persona/shared';

/** 并发下载上限 */
const CONCURRENCY = 8;

/**
 * 下载一个商城包的全部文件到本地目标目录。
 *
 * - 文件清单由 jsDelivr 文件树 API 运行时扫描得到。
 * - 并发下载，统一按二进制字节写盘。
 * - 路径安全：每个文件解析后必须落在 destDir 内，禁止 `..` 越界或绝对路径。
 * - 失败回滚：任一文件下载或写入失败，删掉本次已写入的内容，当作没装过。
 *
 * 这是一个通用下载器：skills / 将来的 MCP 代码 / Agent 资源都复用它，只传不同的 destDir。
 *
 * @param remotePath 包在仓库内的路径
 * @param destDir 本地目标目录的绝对路径
 * @returns destDir
 * @throws 扫描失败、路径越界、下载或写入失败时抛出
 */
export async function downloadPackage(
  remotePath: string,
  destDir: string
): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });

  const files = await listPackageFiles(remotePath);

  if (files.length === 0) {
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error(
      `未找到 ${remotePath} 下的文件，商城数据可能正在同步中，请稍后再试`
    );
  }

  const written: string[] = [];
  const errors: Error[] = [];

  // 并发跑完所有文件；单个失败只记进 errors，不打断其他在途下载，便于统一回滚。
  // 注意：回调内必须自行 try/catch。
  await runWithConcurrency(files, CONCURRENCY, async (relFile) => {
    try {
      const target = path.resolve(destDir, relFile);
      // 路径安全：解析后相对 destDir 的路径不能以 .. 开头，也不能是绝对路径
      const rel = path.relative(destDir, target);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Unsafe file path in package: ${relFile}`);
      }

      const resp = await fetch(cdnUrl(remotePath, relFile));
      if (!resp.ok) {
        throw new Error(`Failed to download ${relFile}: ${resp.status}`);
      }
      const buf = Buffer.from(await resp.arrayBuffer());

      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      written.push(target);
    } catch (err) {
      errors.push(err instanceof Error ? err : new Error(String(err)));
    }
  });

  if (errors.length > 0) {
    // 回滚：删掉本次已写入的文件及目录，当作没装过
    for (const f of written) {
      try {
        fs.unlinkSync(f);
      } catch {
        /* 忽略清理错误 */
      }
    }
    try {
      fs.rmSync(destDir, { recursive: true });
    } catch {
      /* 忽略 */
    }
    throw errors[0];
  }

  return destDir;
}

/**
 * 下载一个商城 Skill 到本地 skills 目录。
 *
 *
 * @param entry 清单条目
 * @returns skill 文件夹的绝对路径
 */
export async function downloadSkill(entry: MarketplaceEntry): Promise<string> {
  const skillsDir = getSkillsDir();
  const folderName = folderNameOf(entry);
  return downloadPackage(entry.path, path.join(skillsDir, folderName));
}

/**
 * 下载一个商城 MCP 到本地 mcp/servers 目录（downloadPackage 的薄封装）。
 *
 * @param entry MCP 清单条目（提供 path）
 * @returns MCP 文件夹的绝对路径
 * @throws 扫描失败、路径越界、下载或写入失败时抛出
 */
export async function downloadMcp(entry: McpMarketplaceEntry): Promise<string> {
  const serversDir = getMcpServersDir();
  const folderName = folderNameOf(entry);
  return downloadPackage(entry.path, path.join(serversDir, folderName));
}

/**
 * 以固定并发上限跑一批异步任务。
 * 回调须自行捕获异常并收集——本函数不再兜底，任意回调抛错都会让整体立刻 reject。
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}
