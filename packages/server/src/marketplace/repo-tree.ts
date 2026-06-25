/**
 * @fileoverview 通过 GitHub Trees API 列出仓库内某路径下的全部文件。
 *
 * 只返回已提交到 git 的文件——构建产物 / 缓存只要被
 * .gitignore 排除、没进仓库，就天然不会出现在结果里。
 *
 * 使用 GitHub API 而非 jsDelivr 数据 API：push 后立即可见，无缓存延迟。
 * 未认证限流 60 次/小时（按 IP），每次安装只调 1 次，个人使用足够。
 */
import { listApiUrl } from './config.js';
import { Logger } from '../util/logger.js';

/** 不应下发到用户机器的 OS 垃圾文件 */
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'ehumbs.db']);

/** GitHub Trees API 返回的单个条目 */
interface GitHubTreeEntry {
  path: string;
  type: string;
}

/**
 * 列出 remotePath 下的全部文件，返回相对 remotePath 的路径数组。
 *
 * 调一次 GitHub Trees API（recursive=1），按前缀过滤出目标条目下的文件，
 * 规范成相对路径，并兜底剔除 OS 垃圾文件。
 *
 * @param remotePath 条目在仓库内的路径，如 'skills/skill-creator'
 * @returns 相对该路径的文件路径，如 ['SKILL.md', 'references/x.md']
 * @throws API 请求失败、限流或响应非法时抛出
 */
export async function listPackageFiles(remotePath: string): Promise<string[]> {
  const resp = await fetch(listApiUrl(), {
    headers: { Accept: 'application/vnd.github+json' },
  });

  const limit = resp.headers.get('x-ratelimit-limit') ?? '?';
  const remaining = resp.headers.get('x-ratelimit-remaining') ?? '?';
  const resetEpoch = Number(resp.headers.get('x-ratelimit-reset') ?? 0);
  const resetTime = resetEpoch
    ? new Date(resetEpoch * 1000).toLocaleTimeString('zh-CN')
    : '?';

  Logger.log(
    'MARKETPLACE',
    `GitHub Trees API — remaining: ${remaining}/${limit}, resets at ${resetTime}`
  );

  if (resp.status === 403) {
    throw new Error(
      `GitHub API 限流，剩余 ${remaining}/${limit}，${resetTime} 重置`
    );
  }
  if (!resp.ok) {
    throw new Error(`Failed to list package files: ${resp.status}`);
  }

  const data = (await resp.json()) as {
    tree: GitHubTreeEntry[];
    truncated: boolean;
  };

  if (data.truncated) {
    Logger.log(
      'MARKETPLACE',
      'GitHub Trees API response truncated, file list may be incomplete'
    );
  }

  return data.tree
    .filter((e) => e.type === 'blob')
    .map((e) => e.path)
    .filter((p) => p.startsWith(`${remotePath}/`))
    .map((p) => p.slice(remotePath.length + 1))
    .filter((rel) => {
      const base = rel.split('/').pop() ?? '';
      return !JUNK_NAMES.has(base);
    });
}
