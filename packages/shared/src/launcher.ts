/**
 * @fileoverview 小手机启动器偏好的共享契约。
 *
 * 排列与壁纸是用户数据，权威副本在服务端 launcher_prefs 表，设备只留缓存。
 * 本文件提供两端共用的文档类型、id 正则与排列对账纯函数，
 * 移动端无法依赖本包，照 sync-shapes 先例手工抄录。
 */

/** 应用 id 的合法形状，小写字母数字加连字符分组，与商城条目 id 同源 */
export const APP_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 系统槽位 id 的保留形状，slot 前缀后接小写字母开头的词 */
export const SLOT_ID_PATTERN = /^slot:[a-z][a-z0-9-]*$/;

/** 排列文档，稀疏数组元素是应用 id、槽位 id 或显式空位 */
export interface LauncherOrderDoc {
  appOrder: (string | null)[];
}

/** 自定义壁纸条目，文件按内容哈希寻址，深浅标记由服务端采样写入 */
export interface WallpaperCustom {
  id: string;
  hash: string;
  thumbHash: string;
  name?: string;
  dark: boolean;
}

/** 壁纸文档，currentId 兼存预设 id 与自定义 id，null 表示默认底 */
export interface WallpaperDoc {
  currentId: string | null;
  customs: WallpaperCustom[];
}

/** launcher_prefs 表的两行键名 */
export type LauncherPrefKey = 'appOrder' | 'wallpaper';

/** 单份偏好文档的信封，updatedAt 是服务端毫秒时间戳，last-write-wins 的裁决依据 */
export interface LauncherPrefEntry<T> {
  payload: T;
  updatedAt: number;
}

/** 全量快照的 launcher 节，行未写入时对应键缺席 */
export interface LauncherSnapshot {
  appOrder?: LauncherPrefEntry<LauncherOrderDoc>;
  wallpaper?: LauncherPrefEntry<WallpaperDoc>;
}

/** launcher_prefs_updated 变更的载荷，携带整份文档，客户端无需回读 */
export interface LauncherPrefsChangeData {
  key: LauncherPrefKey;
  payload: LauncherOrderDoc | WallpaperDoc;
  updatedAt: number;
}

/**
 * 把已存排列与当前应用清单、槽位清单对账成展示序。
 *
 * - 应用组与 appIds 比对，清单里没有的条目清成 null，新应用填进第一个空位
 * - 槽位组只保证在场，缺的补进第一个空位，永不清理
 * - 末尾连续空位收掉，中间空位保留为拖放目标
 */
export function reconcileOrder(
  stored: (string | null)[] | null,
  appIds: string[],
  slots: string[]
): (string | null)[] {
  const valid = new Set([...appIds, ...slots]);
  const order = (stored ?? []).map((id) =>
    id !== null && valid.has(id) ? id : null
  );

  for (const id of [...appIds, ...slots]) {
    if (order.includes(id)) continue;
    const free = order.indexOf(null);
    if (free === -1) order.push(id);
    else order[free] = id;
  }

  while (order.length > 0 && order[order.length - 1] === null) order.pop();
  return order;
}

/**
 * 把 from 位的条目挪到 to 位。
 * 目标有主则对调，目标为空则占位并清空原位，末尾连续空位收掉，越界或同位原样返回。
 */
export function swapAt(
  order: (string | null)[],
  from: number,
  to: number
): (string | null)[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= order.length ||
    to >= order.length
  ) {
    return order;
  }
  const next = [...order];
  next[to] = order[from] as string | null;
  next[from] = order[to];
  while (next.length > 0 && next[next.length - 1] === null) next.pop();
  return next;
}
