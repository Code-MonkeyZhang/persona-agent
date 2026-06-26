/**
 * Marketplace 仓库的 GitHub 地址配置。
 * 集中在这里，以后想换镜像只改这一处。
 * 文件下载走 raw.githubusercontent.com（Fastly CDN），文件树发现走 GitHub Trees API。
 */

export const REPO_OWNER = 'Code-MonkeyZhang';
export const REPO_NAME = 'persona-agent-marketplace';
export const REPO_BRANCH = 'main';

const CDN_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/`;

const LIST_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}?recursive=1`;

export function cdnUrl(...segments: string[]): string {
  return CDN_BASE + segments.join('/');
}

export function manifestUrl(): string {
  return cdnUrl('skills', 'index.json');
}

/** MCP 清单的 GitHub raw 地址 */
export function mcpManifestUrl(): string {
  return cdnUrl('mcp', 'index.json');
}

/** Agent 清单的 GitHub raw 地址 */
export function agentManifestUrl(): string {
  return cdnUrl('agents', 'index.json');
}

export function listApiUrl(): string {
  return LIST_API;
}
