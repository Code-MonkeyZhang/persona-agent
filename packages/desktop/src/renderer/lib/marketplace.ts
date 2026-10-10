/**
 * @file src/renderer/lib/marketplace.ts
 * @description 商城相关的前端工具函数
 */

/**
 * 取清单条目的机器键。
 * 优先读显式 id，缺失回退 path 末段派生，与服务端约定一致。
 * 前端只把它当展示与安装键用，路径安全校验在服务端做。
 */
export function folderNameOf(entry: { id?: string; path: string }): string {
  return entry.id ?? entry.path.split('/').pop()!;
}
