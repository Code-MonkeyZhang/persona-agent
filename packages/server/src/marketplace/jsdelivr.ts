/**
 * @fileoverview 通过 jsDelivr 文件树 API 列出某条目下的全部文件。
 *
 * 只返回已提交到 git 的文件——构建产物 / 缓存（node_modules、__pycache__ 等）只要被
 * .gitignore 排除、没进仓库，就天然不会出现在结果里。
 */
import { listApiUrl } from './config.js';

/** 不应下发到用户机器的 OS 垃圾文件（按文件名兜底，防作者误提交） */
const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'ehthumbs.db']);

/** jsDelivr flat API 返回的单个文件条目 */
interface JsDelivrFileEntry {
  name: string;
}

/**
 * 列出 remotePath 下的全部文件，返回相对 remotePath 的路径数组。
 *
 * 调一次 jsDelivr flat API（返回整个仓库的已提交文件），按前缀过滤出目标条目下的文件，
 * 规范成相对路径，并兜底剔除 OS 垃圾文件。
 *
 * @param remotePath 条目在仓库内的路径，如 'skills/skill-creator'
 * @returns 相对该路径的文件路径，如 ['SKILL.md', 'references/x.md']
 * @throws API 请求失败或响应非法时抛出
 */
export async function listPackageFiles(remotePath: string): Promise<string[]> {
  const resp = await fetch(`${listApiUrl()}?structure=flat`);
  if (!resp.ok) {
    throw new Error(`Failed to list package files: ${resp.status}`);
  }
  const data = (await resp.json()) as { files: JsDelivrFileEntry[] };

  // jsDelivr flat API 的 name 带前导斜杠，如 '/skills/skill-creator/SKILL.md'
  const prefix = `/${remotePath}/`;
  return data.files
    .map((f) => f.name)
    .filter((name) => name.startsWith(prefix))
    .map((name) => name.slice(prefix.length))
    .filter((rel) => {
      const base = rel.split('/').pop() ?? '';
      return !JUNK_NAMES.has(base);
    });
}
