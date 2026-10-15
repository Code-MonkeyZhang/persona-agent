/**
 * @file components/phone/PhonePanel.tsx
 * @description 小手机预览屏容器。圆角屏幕内桌面态常驻，应用与设置以覆盖层接管。
 * 壁纸铺屏幕底，深浅标记驱动桌面文字双态。
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DEFAULT_WALLPAPER_CSS,
  resolveWallpaper,
} from '../../data/wallpaperPresets';
import { useAppPanelStore } from '../../stores/appPanelStore';
import { useLauncherPrefsStore } from '../../stores/launcherPrefsStore';
import { PhoneHome, SETTINGS_SLOT_ID } from './PhoneHome';
import { PhoneAppView } from './PhoneAppView';
import { PhoneSettingsView } from './PhoneSettingsView';

export function PhonePanel() {
  const apps = useAppPanelStore((s) => s.apps);
  const selectedApp = useAppPanelStore((s) => s.selectedApp);
  const loadApps = useAppPanelStore((s) => s.loadApps);
  const wallpaper = useLauncherPrefsStore((s) => s.wallpaper);
  const currentApp = selectedApp
    ? (apps.find((a) => a.name === selectedApp) ?? null)
    : null;
  const settingsOpen = selectedApp === SETTINGS_SLOT_ID;
  const { background, dark } = resolveWallpaper(wallpaper?.payload ?? null);

  /**
   * 挂载即拉取应用清单，预览屏每次展开都会刷新，
   * 新装与卸载的应用即时反映到网格。
   */
  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      <div
        className="relative flex-1 min-h-0 m-2.5 rounded-[26px] overflow-hidden flex flex-col"
        style={{ background: background ?? DEFAULT_WALLPAPER_CSS }}
      >
        {/* 内容层：桌面态常驻铺满，应用与设置以覆盖层形式接管 */}
        <div className="relative flex-1 min-h-0 flex flex-col">
          <PhoneHome dark={dark} />

          <AnimatePresence initial={false}>
            {settingsOpen && (
              <motion.div
                key={SETTINGS_SLOT_ID}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <PhoneSettingsView />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {currentApp && (
              <motion.div
                key={currentApp.name}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <PhoneAppView app={currentApp} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
