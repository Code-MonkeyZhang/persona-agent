/**
 * @file stores/launcherPrefsStore.ts
 * @description 小手机偏好的渲染层中枢。
 * 读走主进程镜像缓存，写直连服务端接口并用返回信封即时更新，
 * 服务端变更回流缓存后由 WebSocketProvider 的去抖钩子驱动刷新。
 */

import { create } from 'zustand';
import type {
  LauncherOrderDoc,
  LauncherPrefEntry,
  WallpaperDoc,
} from '@persona/shared';
import {
  putLauncherOrder,
  putLauncherWallpaperCurrent,
  uploadLauncherWallpaper,
  deleteLauncherWallpaperImage,
} from '../lib/api';
import { processWallpaperFile } from '../lib/wallpaper-image';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';
import { toast } from './toastStore';

interface LauncherPrefsState {
  /** 排列文档信封，null 表示服务端尚无此行 */
  appOrder: LauncherPrefEntry<LauncherOrderDoc> | null;
  /** 壁纸文档信封，null 表示服务端尚无此行 */
  wallpaper: LauncherPrefEntry<WallpaperDoc> | null;

  /** 从镜像缓存读两份文档，快照装载与变更回流后调用 */
  refresh: () => Promise<void>;
  /** 提交排列文档，返回信封即时入 store，不等变更流回流 */
  submitOrder: (appOrder: (string | null)[]) => Promise<void>;
  /** 提交壁纸当前选择 */
  setWallpaper: (currentId: string | null) => Promise<void>;
  /** 压图上传自定义壁纸并选为当前 */
  uploadWallpaper: (file: File) => Promise<void>;
  /** 删除一条自定义壁纸 */
  removeWallpaper: (id: string) => Promise<void>;
}

/** 统一的失败提示，服务端报错原文透出便于定位 */
function failToast(action: string, err: unknown): void {
  const msg = getErrorMessage(err);
  logger.error(`LauncherPrefs: ${action} failed`, err);
  toast.error(msg);
}

export const useLauncherPrefsStore = create<LauncherPrefsState>()(
  (set, get) => ({
    appOrder: null,
    wallpaper: null,

    refresh: async () => {
      try {
        const snapshot = await window.api?.cache.getLauncherPrefs();
        if (!snapshot) return;
        set({
          appOrder: snapshot.appOrder ?? null,
          wallpaper: snapshot.wallpaper ?? null,
        });
      } catch (err) {
        logger.error('LauncherPrefs: failed to read cache', err);
      }
    },

    submitOrder: async (appOrder) => {
      try {
        const entry = await putLauncherOrder(appOrder);
        set({ appOrder: entry });
        logger.info(
          `LauncherPrefs: submitted order updatedAt=${entry.updatedAt}`
        );
      } catch (err) {
        failToast('submit order', err);
      }
    },

    setWallpaper: async (currentId) => {
      try {
        const entry = await putLauncherWallpaperCurrent(currentId);
        set({ wallpaper: entry });
        logger.info(
          `LauncherPrefs: set wallpaper ${currentId ?? 'none'} updatedAt=${entry.updatedAt}`
        );
      } catch (err) {
        failToast('set wallpaper', err);
      }
    },

    /**
     * 上传自定义壁纸并选为当前。
     * 上传接口返回整份壁纸信封，取末尾新增条目作为当前选择。
     */
    uploadWallpaper: async (file) => {
      try {
        const pair = await processWallpaperFile(file);
        const entry = await uploadLauncherWallpaper(pair);
        set({ wallpaper: entry });
        const added = entry.payload.customs.at(-1);
        if (added) await get().setWallpaper(added.id);
        logger.info(`LauncherPrefs: uploaded wallpaper ${added?.id}`);
      } catch (err) {
        failToast('upload wallpaper', err);
      }
    },

    removeWallpaper: async (id) => {
      try {
        const entry = await deleteLauncherWallpaperImage(id);
        set({ wallpaper: entry });
        logger.info(`LauncherPrefs: removed wallpaper ${id}`);
      } catch (err) {
        failToast('remove wallpaper', err);
      }
    },
  })
);
