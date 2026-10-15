/**
 * @file components/phone/PhoneWallpaperPage.tsx
 * @description 手机屏内的壁纸选择页。
 * 三段式：当前壁纸大预览、我的壁纸、系统壁纸。
 * 上传走压图管线产出的主图与缩略图，壁纸只铺桌面层，此页保持浅底。
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, X } from 'lucide-react';
import {
  DEFAULT_WALLPAPER_CSS,
  WALLPAPER_PRESETS,
  resolveWallpaper,
} from '../../data/wallpaperPresets';
import { getWallpaperFileUrl } from '../../lib/api';
import { useLauncherPrefsStore } from '../../stores/launcherPrefsStore';
import { cn } from '../../lib/utils';

interface WallpaperTileProps {
  css: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
  /** 有值时是自定义壁纸，hover 出删除叉 */
  onDelete?: () => void;
}

/** 单格壁纸缩略图，手机比例竖版，选中态蓝描边加对勾角标 */
function WallpaperTile({
  css,
  name,
  selected,
  onSelect,
  onDelete,
}: WallpaperTileProps) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative aspect-[9/17] rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-150 hover:-translate-y-0.5',
        selected ? 'border-[#228be6]' : 'border-transparent'
      )}
    >
      <div className="absolute inset-0" style={{ background: css }} />
      {selected && (
        <span className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-[#228be6] text-white flex items-center justify-center">
          <Check className="w-3 h-3" strokeWidth={3} />
        </span>
      )}
      {onDelete && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-1 left-1 w-[17px] h-[17px] rounded-full bg-black/55 text-white hidden items-center justify-center group-hover:flex cursor-pointer"
        >
          <X className="w-2.5 h-2.5" strokeWidth={3} />
        </span>
      )}
      <span className="absolute bottom-1 left-1.5 text-[10px] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
        {name}
      </span>
    </div>
  );
}

/** 段落标题 */
function SectionLabel({ text }: { text: string }) {
  return (
    <div className="px-1 pt-4 pb-2 text-caption font-medium text-muted-foreground">
      {text}
    </div>
  );
}

export function PhoneWallpaperPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const wallpaper = useLauncherPrefsStore((s) => s.wallpaper);
  const setWallpaper = useLauncherPrefsStore((s) => s.setWallpaper);
  const uploadWallpaper = useLauncherPrefsStore((s) => s.uploadWallpaper);
  const removeWallpaper = useLauncherPrefsStore((s) => s.removeWallpaper);
  const doc = wallpaper?.payload ?? null;
  const currentId = doc?.currentId ?? null;
  const customs = doc?.customs ?? [];
  const { background } = resolveWallpaper(doc);

  /** 上传中锁输入，防止重复提交 */
  const handleUpload = async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      await uploadWallpaper(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#f2f3f5]">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        <SectionLabel text={t('phone.wallpaperCurrent')} />
        <div
          className="mx-auto w-[116px] aspect-[9/17] rounded-2xl border border-black/10 shadow-soft"
          style={{ background: background ?? DEFAULT_WALLPAPER_CSS }}
        />

        <SectionLabel text={t('phone.wallpaperMine')} />
        <div className="grid grid-cols-3 gap-2.5">
          {customs.map((w) => (
            <WallpaperTile
              key={w.id}
              css={`center / cover no-repeat url("${getWallpaperFileUrl(w.thumbHash)}")`}
              name={w.name ?? t('phone.wallpaperCustom')}
              selected={currentId === w.id}
              onSelect={() => void setWallpaper(w.id)}
              onDelete={() => void removeWallpaper(w.id)}
            />
          ))}
          {/* 上传卡片，点击代发 file input */}
          <div
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={cn(
              'aspect-[9/17] rounded-xl border-[1.5px] border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground cursor-pointer transition-colors hover:border-[#228be6] hover:text-[#228be6]',
              uploading && 'opacity-50 pointer-events-none'
            )}
          >
            <Plus className="w-5 h-5" strokeWidth={1.5} />
            <span className="text-[10.5px]">{t('phone.wallpaperUpload')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        <SectionLabel text={t('phone.wallpaperPresets')} />
        <div className="grid grid-cols-3 gap-2.5">
          {/* 默认项把当前选择置回 null，桌面回到默认浅底 */}
          <WallpaperTile
            css={DEFAULT_WALLPAPER_CSS}
            name={t('phone.wallpaperDefault')}
            selected={currentId === null}
            onSelect={() => void setWallpaper(null)}
          />
          {WALLPAPER_PRESETS.map((p) => (
            <WallpaperTile
              key={p.id}
              css={p.css}
              name={t(p.nameKey)}
              selected={currentId === p.id}
              onSelect={() => void setWallpaper(p.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
