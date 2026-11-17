/**
 * @fileoverview 设备缓存目录布局与旧布局的一次性迁移。
 *   全部客户端缓存收在 cache 根下按设备分目录，设备目录名一律是服务器的
 *   真实主机号，目录内是 mirror.db 镜像库与 attachments 附件分区，
 *   删除设备即删整个设备目录。
 *   旧布局是数据根平铺的镜像库文件与 image-cache 根，迁移幂等可重跑。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** 缓存根目录名，全部客户端缓存的唯一入口 */
const CACHE_DIR_NAME = 'cache';

/** 设备目录内镜像库文件名 */
const MIRROR_FILE_NAME = 'mirror.db';

/** 设备目录内附件分区目录名 */
const ATTACHMENTS_DIR_NAME = 'attachments';

/** 旧布局镜像库文件名前缀，后接主机号 */
const LEGACY_MIRROR_PREFIX = 'cache-';

/** 旧布局镜像库文件名后缀 */
const LEGACY_MIRROR_SUFFIX = '.db';

/** 旧布局单例镜像文件名，本机目标缺席时收编为本机镜像 */
const LEGACY_SINGLE_MIRROR = 'desktop-cache.db';

/** 旧布局图片缓存根目录名，分区名即服务器主机号 */
const LEGACY_IMAGE_ROOT = 'image-cache';

/** 统一真实主机号之前的本机目录别名，归拢进真实主机号目录 */
const LEGACY_LOCAL_DIR = 'local';

/** 镜像库主文件的伴生后缀，wal 与 shm */
const MIRROR_SIDECARS = ['-wal', '-shm'];

/** 设备缓存目录路径 */
export function deviceCacheDir(dataDir: string, hostId: string): string {
  return path.join(dataDir, CACHE_DIR_NAME, hostId);
}

/** 设备镜像库文件路径 */
export function mirrorPathFor(dataDir: string, hostId: string): string {
  return path.join(deviceCacheDir(dataDir, hostId), MIRROR_FILE_NAME);
}

/** 设备附件分区目录路径 */
export function attachmentsDirFor(dataDir: string, hostId: string): string {
  return path.join(deviceCacheDir(dataDir, hostId), ATTACHMENTS_DIR_NAME);
}

/**
 * 把旧布局的镜像库文件族迁进设备目录。
 * 旧名 cache-主机ID.db 按文件名映射到 cache/主机ID/mirror.db，
 * 单例与 local 别名的旧名映射到本机服务器的真实主机号，
 * 目标已在时视为孤儿删除。伴生先迁主文件后迁，主文件落位即完成标记，
 * 中断后重跑幂等。
 * @param dataDir - 数据根目录
 * @param localServerHostId - 本机服务器的真实主机号
 * @param log - 迁移动作日志
 */
export function migrateLegacyMirrors(
  dataDir: string,
  localServerHostId: string,
  log: (message: string) => void
): void {
  if (!fs.existsSync(dataDir)) {
    return;
  }
  const names = fs.readdirSync(dataDir).filter((name) => isLegacyMirror(name));
  for (const name of names) {
    const hostId = legacyMirrorHostId(name, localServerHostId);
    const legacyBase = path.join(dataDir, name);
    const target = mirrorPathFor(dataDir, hostId);
    if (fs.existsSync(target)) {
      removeLegacyMirrorFamily(legacyBase);
      log(`removed orphan legacy mirror ${name}, target already in place`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    for (const suffix of MIRROR_SIDECARS) {
      const from = `${legacyBase}${suffix}`;
      if (fs.existsSync(from)) {
        fs.renameSync(from, `${target}${suffix}`);
      }
    }
    fs.renameSync(legacyBase, target);
    log(`migrated legacy mirror ${name} to ${path.relative(dataDir, target)}`);
  }
}

/**
 * 把旧布局 image-cache 根下的分区迁进设备目录的附件分区。
 * 分区名即服务器主机号，远程本机一视同仁原样搬迁，
 * 无法归属的平铺文件与杂物直接删除，迁空的旧根移除。
 * @param dataDir - 数据根目录
 * @param log - 迁移动作日志
 */
export function migrateLegacyPartitions(
  dataDir: string,
  log: (message: string) => void
): void {
  const legacyRoot = path.join(dataDir, LEGACY_IMAGE_ROOT);
  if (!fs.existsSync(legacyRoot)) {
    return;
  }
  for (const name of fs.readdirSync(legacyRoot)) {
    const from = path.join(legacyRoot, name);
    if (!fs.statSync(from).isDirectory()) {
      fs.rmSync(from, { force: true });
      log(`removed unattributable legacy entry ${name}`);
      continue;
    }
    mergeDirInto(from, attachmentsDirFor(dataDir, name));
    log(`migrated legacy partition ${name} into device directory`);
  }
  try {
    fs.rmdirSync(legacyRoot);
    log('removed empty legacy image cache root');
  } catch {
    log('legacy image cache root not empty, left in place');
  }
}

/**
 * 把 local 别名的伪设备目录并进本机真实主机号目录。
 * 中间态构建曾以 local 命名本机目录，镜像库与附件分区逐项并入，
 * 同名项以目标为准跳过，迁空的伪目录移除，幂等可重跑。
 * @param dataDir - 数据根目录
 * @param localServerHostId - 本机服务器的真实主机号
 * @param log - 迁移动作日志
 */
export function foldPseudoLocalDir(
  dataDir: string,
  localServerHostId: string,
  log: (message: string) => void
): void {
  const pseudo = deviceCacheDir(dataDir, LEGACY_LOCAL_DIR);
  if (!fs.existsSync(pseudo)) {
    return;
  }
  mergeDirInto(pseudo, deviceCacheDir(dataDir, localServerHostId));
  log(`folded pseudo local directory into device ${localServerHostId}`);
}

/** 旧布局镜像库主文件的判定，单例与按主机号命名的两种 */
function isLegacyMirror(name: string): boolean {
  return (
    name === LEGACY_SINGLE_MIRROR ||
    (name.startsWith(LEGACY_MIRROR_PREFIX) &&
      name.endsWith(LEGACY_MIRROR_SUFFIX))
  );
}

/** 由旧镜像文件名解出目标主机号，单例与 local 别名归本机，其余剥前缀取中段 */
function legacyMirrorHostId(name: string, localServerHostId: string): string {
  const middle = name.slice(
    LEGACY_MIRROR_PREFIX.length,
    name.length - LEGACY_MIRROR_SUFFIX.length
  );
  if (name === LEGACY_SINGLE_MIRROR || middle === LEGACY_LOCAL_DIR) {
    return localServerHostId;
  }
  return middle;
}

/** 删除旧镜像主文件与伴生 */
function removeLegacyMirrorFamily(legacyBase: string): void {
  fs.rmSync(legacyBase, { force: true });
  for (const suffix of MIRROR_SIDECARS) {
    fs.rmSync(`${legacyBase}${suffix}`, { force: true });
  }
}

/**
 * 把来源目录并入目标目录。
 * 目标缺席时整目录改名，已在时逐项并入，子目录递归合并，
 * 同名项以目标为准跳过，残余源目录删除。
 */
function mergeDirInto(from: string, targetDir: string): void {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });
    fs.renameSync(from, targetDir);
    return;
  }
  for (const name of fs.readdirSync(from)) {
    const source = path.join(from, name);
    const to = path.join(targetDir, name);
    if (fs.statSync(source).isDirectory()) {
      mergeDirInto(source, to);
    } else if (!fs.existsSync(to)) {
      fs.renameSync(source, to);
    }
  }
  fs.rmSync(from, { recursive: true, force: true });
}
