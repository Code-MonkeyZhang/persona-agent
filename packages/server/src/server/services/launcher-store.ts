/**
 * @fileoverview 小手机偏好的权威存储。
 *
 * launcher_prefs 单表双行，key 为 appOrder 与 wallpaper，payload 存纯数据 JSON，
 * updated_at 由服务端盖毫秒时间戳，客户端按它做 last-write-wins 裁决。
 * 壁纸文件按内容哈希落 wallpapers 目录，恒为 JPEG，深浅标记由上传时采样写入。
 * 全部写入走事务内 insertChangeRow、事务外 emitSessionChange 的变更流范式，
 * 客户端凭变更携带的整份文档即可刷新，无需回读。
 */

import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Jimp } from 'jimp';
import type {
  LauncherOrderDoc,
  LauncherPrefEntry,
  LauncherPrefKey,
  LauncherPrefsChangeData,
  WallpaperCustom,
  WallpaperDoc,
} from '@persona/shared';
import { APP_ID_PATTERN, SLOT_ID_PATTERN } from '@persona/shared';
import { getDb } from '../../db/index.js';
import { getWallpapersDir } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';
import { AppError } from '../../util/errors.js';
import { insertChangeRow, emitSessionChange } from '../../session/changes.js';

/** 自定义壁纸数量上限 */
const MAX_CUSTOM_WALLPAPERS = 20;

/** 单张壁纸体积上限，2MB */
const WALLPAPER_MAX_BYTES = 2 * 1024 * 1024;

/** 壁纸短边下限，低于此分辨率拒绝 */
const WALLPAPER_MIN_SHORT_SIDE = 720;

/** 缩略图短边上限，超出视为异常输入 */
const THUMB_MAX_SHORT_SIDE = 480;

/** 深浅采样网格边长 */
const SAMPLE_SIZE = 8;

/** 平均亮度低于该阈值判定深色壁纸，桌面层文字切白 */
const DARK_LUMA_THRESHOLD = 128;

/** launcher_prefs 表一行 */
interface PrefRow {
  key: LauncherPrefKey;
  payload: string;
  updated_at: number;
}

/** jimp 图像实例类型，v1 的 Jimp 导出是值不是类型，经 read 的返回值推断 */
type JimpImage = Awaited<ReturnType<typeof Jimp.read>>;

/** 读一行偏好为信封，行缺席返回 null */
function readEntry<T>(key: LauncherPrefKey): LauncherPrefEntry<T> | null {
  const row = getDb()
    .query<
      PrefRow,
      [string]
    >('SELECT key, payload, updated_at FROM launcher_prefs WHERE key = ?')
    .get(key);
  if (!row) return null;
  return {
    payload: JSON.parse(row.payload) as T,
    updatedAt: row.updated_at,
  };
}

/** 事务内落行加登记变更，提交后广播，返回服务器时间戳 */
function writeDoc(key: LauncherPrefKey, payload: unknown): number {
  const updatedAt = Date.now();
  const db = getDb();
  const event = db.transaction(() => {
    db.query(
      `INSERT INTO launcher_prefs (key, payload, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
    ).run(key, JSON.stringify(payload), updatedAt);
    return insertChangeRow(db, 'launcher_prefs_updated', null, {
      key,
      payload: payload as LauncherOrderDoc | WallpaperDoc,
      updatedAt,
    } satisfies LauncherPrefsChangeData);
  })();
  emitSessionChange(event);
  Logger.log('LAUNCHER', `Saved ${key} doc at ${updatedAt}`);
  return updatedAt;
}

/** 读排列文档信封，行缺席返回 null */
export function getOrderEntry(): LauncherPrefEntry<LauncherOrderDoc> | null {
  return readEntry<LauncherOrderDoc>('appOrder');
}

/** 读壁纸文档信封，行缺席返回 null */
export function getWallpaperEntry(): LauncherPrefEntry<WallpaperDoc> | null {
  return readEntry<WallpaperDoc>('wallpaper');
}

/** 读壁纸文档，行缺席返回初始形状 */
function readWallpaperDoc(): WallpaperDoc {
  return (
    readEntry<WallpaperDoc>('wallpaper')?.payload ?? {
      currentId: null,
      customs: [],
    }
  );
}

/**
 * 提交排列文档。
 * 每项必须是 null 或合法的应用 id 与槽位 id，非法条目按 400 拒绝。
 */
export function putOrder(
  appOrder: (string | null)[]
): LauncherPrefEntry<LauncherOrderDoc> {
  for (const id of appOrder) {
    if (id === null) continue;
    if (!APP_ID_PATTERN.test(id) && !SLOT_ID_PATTERN.test(id)) {
      Logger.log('LAUNCHER', `Rejected order entry: ${id}`);
      throw new AppError(400, `Invalid launcher order id: ${id}`);
    }
  }
  const updatedAt = writeDoc('appOrder', { appOrder });
  return { payload: { appOrder }, updatedAt };
}

/**
 * 提交壁纸当前选择。
 * 本轮只允许改 currentId，自定义清单只能经上传与删除接口变动。
 */
export function putWallpaperCurrent(
  currentId: string | null
): LauncherPrefEntry<WallpaperDoc> {
  const payload: WallpaperDoc = { ...readWallpaperDoc(), currentId };
  const updatedAt = writeDoc('wallpaper', payload);
  return { payload, updatedAt };
}

/** 解码 buffer 为 jimp 图像，解码失败按 400 拒绝 */
async function decodeImage(buffer: Buffer, what: string): Promise<JimpImage> {
  try {
    return await Jimp.read(buffer);
  } catch {
    Logger.log('LAUNCHER', `Rejected ${what}: decode failed`);
    throw new AppError(400, `Invalid ${what}: not a decodable image`);
  }
}

/** 缩到 8x8 网格取平均亮度，低于阈值判定深色 */
function sampleDark(image: JimpImage): boolean {
  const data = image.clone().resize({ w: SAMPLE_SIZE, h: SAMPLE_SIZE })
    .bitmap.data;
  let luma = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    luma += 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return luma / (data.length / 4) < DARK_LUMA_THRESHOLD;
}

/** 按内容哈希落壁纸文件，已存在则跳过写盘，返回哈希 */
function saveWallpaperFile(buffer: Buffer): string {
  const hash = createHash('sha256').update(buffer).digest('hex');
  const dir = getWallpapersDir();
  const filePath = path.join(dir, hash);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }
  return hash;
}

/** 物理删除壁纸文件，仅当删除后的文档没有条目再引用该哈希 */
function deleteWallpaperFile(hash: string): void {
  const referenced = readWallpaperDoc().customs.some(
    (c) => c.hash === hash || c.thumbHash === hash
  );
  if (referenced) return;
  const filePath = path.join(getWallpapersDir(), hash);
  if (fs.existsSync(filePath)) fs.rmSync(filePath);
}

/**
 * 上传一张自定义壁纸。
 * 校验顺序为数量上限、体积上限、主图可解码且短边达标、缩略图可解码且短边不超限，
 * 通过后采样深浅、按哈希落盘、追加进文档并返回整份信封。
 */
export async function addWallpaperImage(
  image: Buffer,
  thumb: Buffer,
  name?: string
): Promise<LauncherPrefEntry<WallpaperDoc>> {
  const doc = readWallpaperDoc();
  if (doc.customs.length >= MAX_CUSTOM_WALLPAPERS) {
    throw new AppError(
      400,
      `Wallpaper limit of ${MAX_CUSTOM_WALLPAPERS} reached`
    );
  }
  if (image.length > WALLPAPER_MAX_BYTES) {
    throw new AppError(400, 'Wallpaper exceeds 2MB limit');
  }
  const mainImage = await decodeImage(image, 'wallpaper image');
  const shortSide = Math.min(mainImage.width, mainImage.height);
  if (shortSide < WALLPAPER_MIN_SHORT_SIDE) {
    Logger.log('LAUNCHER', `Rejected wallpaper: short side ${shortSide}`);
    throw new AppError(
      400,
      `Wallpaper short side must be at least ${WALLPAPER_MIN_SHORT_SIDE}px, portrait images recommended`
    );
  }
  const thumbImage = await decodeImage(thumb, 'wallpaper thumb');
  const thumbShort = Math.min(thumbImage.width, thumbImage.height);
  if (thumbShort > THUMB_MAX_SHORT_SIDE) {
    throw new AppError(
      400,
      `Wallpaper thumb short side must not exceed ${THUMB_MAX_SHORT_SIDE}px`
    );
  }

  const custom: WallpaperCustom = {
    id: `custom-${Date.now()}-${randomBytes(4).toString('hex')}`,
    hash: saveWallpaperFile(image),
    thumbHash: saveWallpaperFile(thumb),
    dark: sampleDark(mainImage),
  };
  if (name) custom.name = name;

  const payload: WallpaperDoc = { ...doc, customs: [...doc.customs, custom] };
  const updatedAt = writeDoc('wallpaper', payload);
  Logger.log(
    'LAUNCHER',
    `Saved wallpaper ${custom.id} hash=${custom.hash} dark=${custom.dark}`
  );
  return { payload, updatedAt };
}

/**
 * 删除一条自定义壁纸。
 * 条目移出文档，被删的是当前壁纸时 currentId 置空，无引用的两个文件随之清理。
 */
export function deleteWallpaperImage(
  id: string
): LauncherPrefEntry<WallpaperDoc> {
  const doc = readWallpaperDoc();
  const entry = doc.customs.find((c) => c.id === id);
  if (!entry) throw new AppError(404, 'Wallpaper not found');
  const payload: WallpaperDoc = {
    currentId: doc.currentId === id ? null : doc.currentId,
    customs: doc.customs.filter((c) => c.id !== id),
  };
  const updatedAt = writeDoc('wallpaper', payload);
  deleteWallpaperFile(entry.hash);
  deleteWallpaperFile(entry.thumbHash);
  Logger.log('LAUNCHER', `Deleted wallpaper ${id}`);
  return { payload, updatedAt };
}

/** 哈希地址的合法形状，64 位小写十六进制，防路径穿越 */
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/** 按哈希取壁纸文件路径，非法或缺失返回 null */
export function getWallpaperFilePath(hash: string): string | null {
  if (!HASH_PATTERN.test(hash)) return null;
  const filePath = path.join(getWallpapersDir(), hash);
  return fs.existsSync(filePath) ? filePath : null;
}
