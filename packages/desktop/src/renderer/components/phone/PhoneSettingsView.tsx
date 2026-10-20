/**
 * @file components/phone/PhoneSettingsView.tsx
 * @description 手机屏内的设置伪 App 打开态。
 * 壁纸与桌面布局这类小手机自身偏好在此配置，
 * 子页用本地 state 切换，顶栏走 PhoneAppBar，返回钮与 Esc 逐层退回，退无可退回桌面。
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Image as ImageIcon,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import {
  WALLPAPER_PRESETS,
  resolveWallpaper,
} from '../../data/wallpaperPresets';
import { useAppPanelStore } from '../../stores/appPanelStore';
import { useLauncherPrefsStore } from '../../stores/launcherPrefsStore';
import { cn } from '../../lib/utils';
import { PhoneAppBar } from './PhoneAppBar';
import { PhoneWallpaperPage } from './PhoneWallpaperPage';

type SettingsPage = 'settings' | 'wallpaper';

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value?: string | null;
  /** 当前壁纸缩略图背景，传入时渲染在行尾 */
  thumb?: string | null;
  onClick: () => void;
}

/** iOS 设置风格的单行配置项 */
function SettingsRow({
  icon,
  iconBg,
  label,
  value,
  thumb,
  onClick,
}: SettingsRowProps) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 text-left active:bg-black/[0.03]"
    >
      <span
        className={cn(
          'w-[27px] h-[27px] rounded-lg flex items-center justify-center shrink-0',
          iconBg
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] text-foreground">
        {label}
      </span>
      {value && (
        <span className="max-w-[110px] truncate text-caption text-muted-foreground">
          {value}
        </span>
      )}
      {thumb && (
        <span
          className="w-[22px] h-[38px] rounded-md border border-black/10 shrink-0"
          style={{ background: thumb }}
        />
      )}
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />
      <span className="sr-only">{t('phone.back')}</span>
    </button>
  );
}

export function PhoneSettingsView() {
  const { t } = useTranslation();
  const [page, setPage] = useState<SettingsPage>('settings');
  const selectApp = useAppPanelStore((s) => s.selectApp);
  const wallpaper = useLauncherPrefsStore((s) => s.wallpaper);
  const submitOrder = useLauncherPrefsStore((s) => s.submitOrder);
  const doc = wallpaper?.payload ?? null;
  const { background } = resolveWallpaper(doc);

  /** 返回钮逐层退，壁纸页退设置页，设置页退桌面 */
  const handleBack = () => {
    if (page === 'wallpaper') setPage('settings');
    else selectApp(null);
  };

  /**
   * Esc 是返回键的键盘等价物，先退子页，退无可退回桌面。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBack]);

  /** 当前壁纸展示名，预设走 i18n 键，自定义走条目名 */
  let currentName = t('phone.wallpaperDefault');
  if (doc?.currentId) {
    const preset = WALLPAPER_PRESETS.find((p) => p.id === doc.currentId);
    if (preset) currentName = t(preset.nameKey);
    else {
      const custom = doc.customs.find((c) => c.id === doc.currentId);
      if (custom) currentName = custom.name ?? t('phone.wallpaperCustom');
    }
  }

  /** 重置排列为空文档，对账后回到清单原序，随后退回桌面 */
  const handleResetLayout = () => {
    void submitOrder([]);
    selectApp(null);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <PhoneAppBar
        title={
          page === 'wallpaper' ? t('phone.wallpaper') : t('phone.settings')
        }
        tile={
          <div className="w-6 h-6 rounded-[6px] shrink-0 flex items-center justify-center bg-[#f3f5f8] border border-[rgba(22,32,46,0.08)]">
            <Settings className="w-[11px] h-[11px] text-[#5c6470]" />
          </div>
        }
        onBack={handleBack}
      />

      {/* 内容层：设置首页常驻，壁纸页以覆盖层形式接管 */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto">
          <div className="p-3.5">
            <div className="rounded-xl border border-border bg-white overflow-hidden">
              <SettingsRow
                icon={<ImageIcon className="w-4 h-4 text-[#e8590c]" />}
                iconBg="bg-[#fff4e6]"
                label={t('phone.wallpaper')}
                value={currentName}
                thumb={background}
                onClick={() => setPage('wallpaper')}
              />
              <div className="mx-3 border-t border-border/70" />
              <SettingsRow
                icon={<LayoutGrid className="w-4 h-4 text-[#1971c2]" />}
                iconBg="bg-[#e7f1ff]"
                label={t('phone.resetLayout')}
                value={t('phone.resetLayoutDesc')}
                onClick={handleResetLayout}
              />
            </div>
            <p className="mt-3 px-2 text-micro leading-relaxed text-muted-foreground/70">
              {t('phone.settingsNote')}
            </p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {page === 'wallpaper' && (
            <motion.div
              key="wallpaper"
              className="absolute inset-0"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <PhoneWallpaperPage />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
