/**
 * @fileoverview 测试临时目录的统一清理入口
 */

import * as fs from 'node:fs';

/**
 * 尽力而为的递归删除。
 * Windows 下 Defender 扫描或句柄未及释放会短暂锁住临时目录，
 * 清理失败只意味着残留待系统清理，不应判测试失败。
 */
export function rmTempDir(dir: string): void {
  try {
    fs.rmSync(dir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  } catch {
    // 忽略清理失败，理由见 JSDoc
  }
}
