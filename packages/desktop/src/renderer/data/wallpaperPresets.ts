/**
 * @file data/wallpaperPresets.ts
 * @description 小手机内置壁纸预设与壁纸文档解析。
 * 预设全部用渐变实现，零图片资源依赖，名字走 i18n 键。
 */

import type { WallpaperDoc } from '@persona/shared';
import { getWallpaperFileUrl } from '../lib/api';

/** 未设壁纸时的默认底，屏幕容器与壁纸页的默认项共用 */
export const DEFAULT_WALLPAPER_CSS =
  'radial-gradient(420px 300px at 88% -8%, rgba(34,139,230,0.10), transparent 60%), radial-gradient(360px 300px at -8% 108%, rgba(139,92,246,0.07), transparent 60%), linear-gradient(168deg, #e9f1fa 0%, #f3f6fb 50%, #eef1f6 100%)';

/** 内置预设条目 */
export interface WallpaperPreset {
  id: string;
  /** 展示名 i18n 键 */
  nameKey: string;
  /** CSS background 值 */
  css: string;
  /** 深色壁纸为 true，桌面文字走白色 */
  dark: boolean;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'dawn',
    nameKey: 'wallpaper.dawn',
    dark: false,
    css: 'radial-gradient(320px 220px at 50% 100%, rgba(255,196,140,0.55), transparent 70%), radial-gradient(560px 400px at 20% 0%, rgba(214,226,247,0.5), transparent 65%), linear-gradient(180deg, #c7d4ea 0%, #e6d8e4 42%, #f9e4cf 74%, #fde8cd 100%)',
  },
  {
    id: 'coast',
    nameKey: 'wallpaper.coast',
    dark: false,
    css: 'radial-gradient(360px 240px at 78% 16%, rgba(255,244,214,0.75), transparent 70%), radial-gradient(640px 120px at 50% 62%, rgba(255,255,255,0.28), transparent 75%), linear-gradient(180deg, #a9d3ee 0%, #cde9ff 38%, #e8f6fc 58%, #f4ecd9 100%)',
  },
  {
    id: 'lavender',
    nameKey: 'wallpaper.lavender',
    dark: false,
    css: 'radial-gradient(420px 300px at 80% 0%, rgba(244,208,255,0.6), transparent 68%), radial-gradient(380px 280px at 12% 88%, rgba(196,181,253,0.5), transparent 70%), linear-gradient(165deg, #f6efff 0%, #ead9f8 48%, #e0cdf2 78%, #d9c6f0 100%)',
  },
  {
    id: 'sunset',
    nameKey: 'wallpaper.sunset',
    dark: true,
    css: 'radial-gradient(90px 90px at 50% 66%, rgba(255,214,140,0.9), transparent 60%), radial-gradient(340px 240px at 50% 70%, rgba(255,158,87,0.55), transparent 72%), linear-gradient(190deg, #140f2e 0%, #3b2264 34%, #8f3e63 58%, #e8734a 80%, #ffb26b 100%)',
  },
  {
    id: 'night',
    nameKey: 'wallpaper.night',
    dark: true,
    css: 'radial-gradient(26px 26px at 79% 14%, rgba(240,244,255,0.95), rgba(240,244,255,0) 62%), radial-gradient(600px 420px at 70% 20%, rgba(99,102,241,0.16), transparent 70%), radial-gradient(480px 360px at 18% 84%, rgba(56,130,184,0.14), transparent 70%), radial-gradient(1.5px 1.5px at 22% 28%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 64% 18%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 82% 42%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 38% 52%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 55% 68%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 30% 10%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 70% 56%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 12% 44%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 88% 74%, #fff 50%, transparent 51%), linear-gradient(178deg, #070b1d 0%, #101638 55%, #1b1f4b 100%)',
  },
];

/**
 * 把壁纸文档解析成屏幕可消费的背景与深浅标记。
 * currentId 命中预设取渐变，命中自定义按内容哈希拼下载地址，
 * null 或 id 残留条目已丢时按未设置处理走默认底。
 */
export function resolveWallpaper(doc: WallpaperDoc | null): {
  background: string | null;
  dark: boolean;
} {
  if (!doc?.currentId) return { background: null, dark: false };
  const preset = WALLPAPER_PRESETS.find((p) => p.id === doc.currentId);
  if (preset) return { background: preset.css, dark: preset.dark };
  const custom = doc.customs.find((c) => c.id === doc.currentId);
  if (custom) {
    return {
      background: `center / cover no-repeat url("${getWallpaperFileUrl(custom.hash)}")`,
      dark: custom.dark,
    };
  }
  return { background: null, dark: false };
}
