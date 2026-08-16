/**
 * @file scripts/sync-shared.mjs
 * @description 确保 node_modules/@persona/shared 指向本地 ../shared 源码而非过期副本。
 *
 * desktop 用 npm 安装，依赖声明 "@persona/shared": "file:../shared"，npm 会把它
 * 拷贝成快照。一旦 shared 改了而 desktop 没重装，就会用到过期副本（移动端曾因此
 * 缺少 AppNotificationMessage 类型）。本脚本在 postinstall 把该位置替换为指向
 * 源码的链接，使其永远跟随最新代码。
 *
 * 跨平台：POSIX 用符号链接，Windows 用 junction（目录链接，免管理员权限）。
 * shared 是 devDependency 且源码在构建时被内联进产物，此链接仅影响编译/类型检查，
 * 不进入最终打包的应用。
 */
import {
  symlinkSync,
  existsSync,
  lstatSync,
  rmSync,
  mkdirSync,
  readlinkSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, '..');
const sharedSrc = resolve(desktopRoot, '..', 'shared');
const linkPath = resolve(desktopRoot, 'node_modules/@persona/shared');
const linkDir = dirname(linkPath);

// 已经是指向源码的链接则无需处理
if (
  existsSync(linkPath) &&
  lstatSync(linkPath).isSymbolicLink() &&
  resolve(linkDir, readlinkSync(linkPath)) === sharedSrc
) {
  process.exit(0);
}

mkdirSync(linkDir, { recursive: true });
if (existsSync(linkPath)) {
  rmSync(linkPath, { recursive: true, force: true });
}

symlinkSync(
  sharedSrc,
  linkPath,
  process.platform === 'win32' ? 'junction' : 'dir'
);
console.log(`[sync-shared] linked node_modules/@persona/shared -> ${sharedSrc}`);
