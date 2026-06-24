/**
 * Marketplace 仓库的 jsDelivr 地址配置（CDN + 文件树 API）。
 * 集中在这里，以后想换镜像只改这一处。文件字节走 CDN，目录扫描走 data API。
 */

export const REPO_OWNER = 'Code-MonkeyZhang';
export const REPO_NAME = 'persona-agent-marketplace';
export const REPO_BRANCH = 'main';

const CDN_BASE = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}/`;

const LIST_API = `https://data.jsdelivr.com/v1/packages/gh/${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}`;

export function cdnUrl(...segments: string[]): string {
  return CDN_BASE + segments.join('/');
}

export function manifestUrl(): string {
  return cdnUrl('skills', 'index.json');
}

export function listApiUrl(): string {
  return LIST_API;
}
