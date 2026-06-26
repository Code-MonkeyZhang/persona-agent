/**
 * @file src/renderer/lib/marketplace.ts
 * @description 商城相关的前端工具函数
 */

/** 取清单条目的文件夹名, path 的最后一段, 同时也是商品 ID */
export function folderNameOf(entry: { path: string }): string {
  return entry.path.split('/').pop()!;
}
